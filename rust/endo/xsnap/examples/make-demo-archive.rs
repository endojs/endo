#!/usr/bin/env -S cargo script
//! Helper: creates dir-handle-demo.zip from dir-handle-demo.js.
//!
//! Usage:
//!   cargo run --example make-demo-archive
//!
//! Produces `target/dir-handle-demo.zip` which can be executed with:
//!   target/debug/endor run target/dir-handle-demo.zip

use std::io::Write;

fn main() {
    let js_source = include_str!("dir-handle-demo.js");

    let compartment_map = r#"{
  "entry": { "compartment": "demo-v1.0.0", "module": "." },
  "compartments": {
    "demo-v1.0.0": {
      "name": "demo",
      "modules": {
        ".": { "parser": "mjs", "location": "index.js" }
      }
    }
  }
}"#;

    let out_path = "target/dir-handle-demo.zip";
    std::fs::create_dir_all("target").expect("create target/");

    let file = std::fs::File::create(out_path).expect("create zip");
    let mut zip = zip::ZipWriter::new(file);
    let opts = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Stored);

    zip.start_file("compartment-map.json", opts).unwrap();
    zip.write_all(compartment_map.as_bytes()).unwrap();

    zip.start_file("demo-v1.0.0/index.js", opts).unwrap();
    zip.write_all(js_source.as_bytes()).unwrap();

    zip.finish().unwrap();
    println!("Wrote {}", out_path);
}
