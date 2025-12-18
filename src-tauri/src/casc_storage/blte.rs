use std::fs::File;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use flate2::read::DeflateDecoder;
use salsa20::cipher::{consts::U10, StreamCipher, StreamCipherCoreWrapper};
use salsa20::SalsaCore;

use crate::casc_storage::keys::KeyService;
use crate::casc_storage::types::is_type::IndexEntry;
use crate::casc_storage::types::CascError;
use crate::logger;

#[allow(dead_code)]
const BLTE_MAGIC: u32 = 0x4554_4C42; // "BLTE"

pub fn read_blte(data_dir: &Path, entry: &IndexEntry, _ekey: [u8; 16], keys: &crate::casc_storage::keys::KeyService) -> Result<Vec<u8>, CascError> {
    let data_path = data_dir
        .join("data")
        .join(format!("data.{:03}", entry.archive));

    let mut file = File::open(&data_path).map_err(CascError::Io)?;
    file.seek(SeekFrom::Start(entry.offset as u64))
        .map_err(CascError::Io)?;

    // Header: 16 bytes MD5 (reversed), 4 bytes size, 10 bytes unknown, then BLTE payload (size - 30)
    let mut header_md5 = [0u8; 16];
    file.read_exact(&mut header_md5).map_err(CascError::Io)?;
    header_md5.reverse();

    if header_md5[..9] != entry.key9 {
        return Err(CascError::InvalidBlte);
    }

    let mut size_le = [0u8; 4];
    file.read_exact(&mut size_le).map_err(CascError::Io)?;
    let size_val = u32::from_le_bytes(size_le);
    if size_val != entry.size {
        return Err(CascError::InvalidBlte);
    }

    // Skip 10 unknown bytes
    file.seek(SeekFrom::Current(10)).map_err(CascError::Io)?;

    let payload_size = entry
        .size
        .checked_sub(30)
        .ok_or(CascError::InvalidBlte)? as usize;

    let mut buf = vec![0u8; payload_size];
    file.read_exact(&mut buf).map_err(CascError::Io)?;

    let tag = hex::encode(_ekey);
    parse_blte_with_keys(&buf, Some(keys), Some(tag.as_str()))
}

#[allow(dead_code)]
pub fn parse_blte(src: &[u8]) -> Result<Vec<u8>, CascError> {
    parse_blte_with_keys(src, None, None)
}

pub fn parse_blte_with_keys(src: &[u8], key_service: Option<&KeyService>, tag: Option<&str>) -> Result<Vec<u8>, CascError> {
    match tag {
        Some(t) => logger::info("BLTE", format!("decode start: bytes={} ekey={}", src.len(), t)),
        None => logger::info("BLTE", format!("decode start: bytes={}", src.len())),
    }

    if src.len() < 8 {
        return Err(CascError::InvalidBlte);
    }

    let mut r = Reader { data: src, pos: 0 };

    // Magic
    let magic = r.read_bytes(4)?;
    if magic != b"BLTE" {
        return Err(CascError::InvalidBlte);
    }

    let header_size = r.read_u32_be()?;
    let has_header = header_size != 0 && header_size != 0xFFFFFFFF;

    let size = src.len();

    let mut blocks = Vec::new();

    if has_header {
        if size < 12 {
            return Err(CascError::InvalidBlte);
        }

        let fc = r.read_bytes(4)?;
        if fc[0] != 0x0F {
            return Err(CascError::InvalidBlte);
        }

        let num_blocks = ((fc[1] as usize) << 16)
            | ((fc[2] as usize) << 8)
            | (fc[3] as usize);

        if num_blocks == 0 {
            return Err(CascError::InvalidBlte);
        }

        let expected_header_size = 12 + num_blocks * 24;
        if header_size as usize != expected_header_size {
            return Err(CascError::InvalidBlte);
        }

        if size < expected_header_size {
            return Err(CascError::InvalidBlte);
        }

        for _ in 0..num_blocks {
            let comp_size = r.read_u32_be()? as usize;
            let decomp_size = r.read_u32_be()? as usize;
            let hash = r.read_bytes(16)?.to_vec();

            blocks.push(DataBlock {
                comp_size,
                decomp_size,
                hash,
            });
        }
    } else {
        // Single-block BLTE (no table)
        blocks.push(DataBlock {
            comp_size: size - 8,
            decomp_size: size - 9,
            hash: Vec::new(),
        });
    }

    logger::info("BLTE", format!("header parsed: chunks={}", blocks.len()));

    let total_out: usize = blocks.iter().map(|b| b.decomp_size).sum();
    let mut out = Vec::with_capacity(total_out);

    for (i, block) in blocks.into_iter().enumerate() {
        let block_data = r.read_bytes(block.comp_size)?;

        // MD5 validation (C# does this when header present)
        if has_header && block.hash.len() == 16 {
            let computed = md5::compute(block_data);

            if computed.0[..] != block.hash[..] {
                return Err(CascError::InvalidBlte);
            }
        }

        let start_len = out.len();
        if let Err(e) = handle_block(block_data, &mut out, i, block.decomp_size, key_service) {
            let bt = block_data.first().copied().unwrap_or(b'?');
            logger::error(
                "BLTE",
                format!(
                    "chunk decode failed: ekey={} chunk={} type='{}' comp={} out={} err={}",
                    tag.unwrap_or("unknown"),
                    i,
                    printable_block_type(bt),
                    block.comp_size,
                    block.decomp_size,
                    e
                ),
            );
            let _ = dump_failed_chunk(tag, i, block_data);
            return Err(e);
        }
        if out.len().saturating_sub(start_len) != block.decomp_size {
            logger::error(
                "BLTE",
                format!(
                    "chunk size mismatch: ekey={} chunk={} produced={} expected={}",
                    tag.unwrap_or("unknown"),
                    i,
                    out.len().saturating_sub(start_len),
                    block.decomp_size
                ),
            );
            let _ = dump_failed_chunk(tag, i, block_data);
            return Err(CascError::InvalidBlte);
        }
    }

    if out.len() != total_out {
        return Err(CascError::InvalidBlte);
    }

    logger::info("BLTE", format!("decoded bytes={}", out.len()));
    Ok(out)
}

fn handle_block(
    block: &[u8],
    out: &mut Vec<u8>,
    index: usize,
    expected_out: usize,
    key_service: Option<&KeyService>,
) -> Result<(), CascError> {
    if block.is_empty() {
        return Err(CascError::InvalidBlte);
    }

    let block_type = block[0];
    let payload = &block[1..];

    match block_type {
        b'N' => {
            if payload.len() != expected_out {
                return Err(CascError::InvalidBlte);
            }
            out.extend_from_slice(payload);
            Ok(())
        }
        b'Z' => {
            if payload.len() < 2 {
                return Err(CascError::InvalidBlte);
            }
            let mut tmp = Vec::with_capacity(expected_out);
            let mut decoder = DeflateDecoder::new(&payload[2..]);
            decoder.read_to_end(&mut tmp).map_err(|e| {
                logger::error(
                    "BLTE",
                    format!(
                        "deflate decode failed: chunk={} expected_out={} err={}",
                        index, expected_out, e
                    ),
                );
                CascError::InvalidBlte
            })?;
            if tmp.len() != expected_out {
                return Err(CascError::InvalidBlte);
            }
            out.extend_from_slice(&tmp);
            Ok(())
        }
        b'E' => decrypt_and_handle(payload, out, index, expected_out, key_service),
        b'F' => Err(CascError::InvalidBlte),
        _ => Err(CascError::InvalidBlte),
    }
}

type Salsa20Core = SalsaCore<U10>;
type Salsa20Cipher = StreamCipherCoreWrapper<Salsa20Core>;

const SALSA20_TAU: [u32; 4] = [0x6170_7865, 0x3120_646e, 0x7962_2d36, 0x6b20_6574];

fn salsa20_decrypt_128(key: &[u8; 16], nonce: &[u8; 8], data: &[u8]) -> Vec<u8> {
    // Salsa20 128-bit keys use the "expand 16-byte k" constants (tau) and repeat the key.
    let mut state = [0u32; 16];
    state[0] = SALSA20_TAU[0];
    state[5] = SALSA20_TAU[1];
    state[10] = SALSA20_TAU[2];
    state[15] = SALSA20_TAU[3];

    for (i, chunk) in key.chunks(4).enumerate() {
        state[1 + i] = u32::from_le_bytes(chunk.try_into().unwrap());
        state[11 + i] = u32::from_le_bytes(chunk.try_into().unwrap());
    }

    state[6] = u32::from_le_bytes(nonce[0..4].try_into().unwrap());
    state[7] = u32::from_le_bytes(nonce[4..8].try_into().unwrap());
    state[8] = 0;
    state[9] = 0;

    let core = Salsa20Core::from_raw_state(state);
    let mut cipher = Salsa20Cipher::from_core(core);
    let mut out = data.to_vec();
    cipher.apply_keystream(&mut out);
    out
}

const STRICT_MISSING_KEYS: bool = false;

fn decrypt_and_handle(
    data: &[u8],
    out: &mut Vec<u8>,
    index: usize,
    expected_out: usize,
    key_service: Option<&KeyService>,
) -> Result<(), CascError> {
    if data.len() < 1 + 8 + 1 + 4 {
        return Err(CascError::InvalidBlte);
    }
    let key_name_size = data[0];
    if key_name_size == 0 || key_name_size != 8 {
        return Err(CascError::InvalidBlte);
    }
    if data.len() < 1 + key_name_size as usize + 1 + 4 {
        return Err(CascError::InvalidBlte);
    }
    let key_name_bytes = &data[1..1 + key_name_size as usize];
    let key_name = u64::from_le_bytes(key_name_bytes.try_into().unwrap());

    let iv_size = data[1 + key_name_size as usize];
    if (iv_size != 4 && iv_size != 8) || iv_size as usize > 0x10 {
        return Err(CascError::InvalidBlte);
    }
    let iv_start = 1 + key_name_size as usize + 1;
    let iv_end = iv_start + iv_size as usize;
    if data.len() < iv_end + 1 {
        return Err(CascError::InvalidBlte);
    }
    let mut iv = data[iv_start..iv_end].to_vec();
    if iv.len() == 4 {
        iv.resize(8, 0);
    }

    let enc_type = data[iv_end];
    if enc_type != b'S' && enc_type != b'A' {
        return Err(CascError::InvalidBlte);
    }

    // Magic index xor
    for i in 0..4 {
        iv[i] ^= ((index >> (i * 8)) & 0xFF) as u8;
    }

    let body = &data[iv_end + 1..];
    let key_bytes = key_service.and_then(|ks| ks.get(key_name));

    if key_bytes.is_none() {
        logger::warn(
            "BLTE",
            format!(
                "missing decrypt key: {:016x} (chunk={} out={})",
                key_name, index, expected_out
            ),
        );

        // If the payload isn't actually encrypted, it can already be a nested BLTE block ('N'/'Z'/...).
        if !body.is_empty() && matches!(body[0], b'N' | b'Z' | b'E' | b'F') {
            let start_len = out.len();
            if handle_block(body, out, index, expected_out, key_service).is_ok() {
                if out.len().saturating_sub(start_len) == expected_out {
                    return Ok(());
                }
            }
            out.truncate(start_len);
        }

        if STRICT_MISSING_KEYS {
            return Err(CascError::MissingDecryptionKey(key_name));
        }

        // CASCExplorer parity: missing key -> zero-fill the expected output size and continue.
        out.extend(std::iter::repeat(0u8).take(expected_out));
        return Ok(());
    }

    if enc_type == b'A' {
        return Err(CascError::InvalidBlte);
    };

    let key_arr = key_bytes.unwrap();
    let mut nonce = [0u8; 8];
    nonce.copy_from_slice(&iv[..8]);
    let decrypted = salsa20_decrypt_128(&key_arr, &nonce, body);

    logger::debug(
        "BLTE",
        format!(
            "encrypted chunk: key={:016x} iv={} comp={}",
            key_name,
            hex::encode(&iv),
            decrypted.len()
        ),
    );

    // Some payloads are raw after decryption (no nested BLTE block header). If the first byte is
    // not a known block type, treat the decrypted data as literal.
    let start_len = out.len();
    if decrypted.is_empty() || !matches!(decrypted[0], b'N' | b'Z' | b'E' | b'F') {
        logger::warn(
            "BLTE",
            format!(
                "decrypted payload missing BLTE block type: chunk={} key={:016x} first={} len={} expected_out={}",
                index,
                key_name,
                decrypted
                    .get(0)
                    .copied()
                    .map(|b| format!("0x{b:02X}"))
                    .unwrap_or_else(|| "EOF".to_string()),
                decrypted.len(),
                expected_out
            ),
        );
        out.extend_from_slice(&decrypted);
        if out.len().saturating_sub(start_len) != expected_out {
            return Err(CascError::InvalidBlte);
        }
        return Ok(());
    }

    handle_block(&decrypted, out, index, expected_out, key_service)?;
    if out.len().saturating_sub(start_len) != expected_out {
        return Err(CascError::InvalidBlte);
    }
    Ok(())
}

struct Reader<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    #[allow(dead_code)]
    fn read_u32_le(&mut self) -> Result<u32, CascError> {
        let bytes = self.read_bytes(4)?;
        Ok(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }

    fn read_u32_be(&mut self) -> Result<u32, CascError> {
        let bytes = self.read_bytes(4)?;
        Ok(u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }

    fn read_bytes(&mut self, count: usize) -> Result<&'a [u8], CascError> {
        let end = self.pos.checked_add(count).ok_or(CascError::InvalidBlte)?;
        let slice = self
            .data
            .get(self.pos..end)
            .ok_or(CascError::InvalidBlte)?;
        self.pos = end;
        Ok(slice)
    }
}

struct DataBlock {
    comp_size: usize,
    decomp_size: usize,
    hash: Vec<u8>,
}

fn printable_block_type(b: u8) -> char {
    match b {
        b'N' | b'Z' | b'E' | b'F' => b as char,
        _ => '?',
    }
}

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")))
        .to_path_buf()
}

fn dump_failed_chunk(tag: Option<&str>, index: usize, block: &[u8]) -> Result<(), CascError> {
    let base = repo_root().join("debug_inputs").join("blte_failed");
    fs::create_dir_all(&base)?;

    let name = tag.unwrap_or("unknown");
    let path = base.join(format!("{name}_chunk{index:04}_raw.bin"));
    fs::write(&path, block)?;

    logger::warn("BLTE", format!("dumped failed chunk to {}", path.display()));
    Ok(())
}
