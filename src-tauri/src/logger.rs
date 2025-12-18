use std::fmt;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Level {
    Debug,
    Info,
    Warn,
    Error,
}

fn ansi(code: &str) -> &'static str {
    match code {
        "reset" => "\x1b[0m",
        "dim" => "\x1b[2m",
        "gray" => "\x1b[90m",
        "red" => "\x1b[31m",
        "green" => "\x1b[32m",
        "yellow" => "\x1b[33m",
        "blue" => "\x1b[34m",
        "magenta" => "\x1b[35m",
        "cyan" => "\x1b[36m",
        _ => "\x1b[0m",
    }
}

fn tag_color(tag: &str) -> &'static str {
    match tag {
        "CASC" => ansi("green"),
        "CDN" => ansi("blue"),
        "BLTE" => ansi("cyan"),
        "DB2" => ansi("magenta"),
        "LISTFILE" => ansi("yellow"),
        "KEYS" => ansi("yellow"),
        "TACTKEY" => ansi("cyan"),
        "SPELLDUMP" => ansi("magenta"),
        _ => ansi("gray"),
    }
}

fn level_color(level: Level) -> &'static str {
    match level {
        Level::Debug => ansi("gray"),
        Level::Info => ansi("green"),
        Level::Warn => ansi("yellow"),
        Level::Error => ansi("red"),
    }
}

pub fn log(tag: &str, level: Level, msg: impl fmt::Display) {
    let tag_c = tag_color(tag);
    let lvl_c = level_color(level);
    let reset = ansi("reset");

    let lvl = match level {
        Level::Debug => "DBG",
        Level::Info => "INF",
        Level::Warn => "WRN",
        Level::Error => "ERR",
    };

    println!("{lvl_c}{lvl}{reset} {tag_c}[{tag}]{reset} {msg}");
}

pub fn debug(tag: &str, msg: impl fmt::Display) {
    log(tag, Level::Debug, msg);
}

pub fn info(tag: &str, msg: impl fmt::Display) {
    log(tag, Level::Info, msg);
}

pub fn warn(tag: &str, msg: impl fmt::Display) {
    log(tag, Level::Warn, msg);
}

pub fn error(tag: &str, msg: impl fmt::Display) {
    log(tag, Level::Error, msg);
}
