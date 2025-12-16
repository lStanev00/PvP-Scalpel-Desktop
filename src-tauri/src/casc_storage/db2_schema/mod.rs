#![allow(dead_code)]

pub mod common;
pub mod record_iter;
pub mod string_table;
pub mod dbd;
pub mod wdc5;
pub mod tables;
pub mod dump;

#[allow(unused_imports)]
pub use tables::area_table::{parse_area_table, AreaTableRow};
