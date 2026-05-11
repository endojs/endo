use std::env;
use std::path::PathBuf;

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let moddable_dir = manifest_dir.join("../../../c/moddable");
    let xs_sources = moddable_dir.join("xs/sources");

    // If the Moddable XS C sources are present, compile them.
    // Otherwise fall back to a pre-built libxs.a if one exists in
    // the prebuilt/ directory (checked in for environments that lack
    // the full SDK).
    if xs_sources.join("xsAll.c").exists() {
        compile_xs(&manifest_dir, &moddable_dir);
    } else {
        let prebuilt = manifest_dir.join("prebuilt/libxs.a");
        if prebuilt.exists() {
            let dest = out_dir.join("libxs.a");
            std::fs::copy(&prebuilt, &dest).expect("copy prebuilt libxs.a");
            println!(
                "cargo:rustc-link-search=native={}",
                out_dir.display()
            );
            println!("cargo:rustc-link-lib=static=xs");
            eprintln!(
                "cargo:warning=Using prebuilt libxs.a (Moddable XS sources not found)"
            );
            // The prebuilt may not include symbols we added to
            // xsnap-platform.c after it was built.  Compile a
            // minimal supplement that provides any missing symbols.
            compile_platform_supplement(&out_dir);
        } else {
            panic!(
                "Moddable XS sources not found at {} and no prebuilt \
                 libxs.a at {}. Run `git submodule update --init \
                 c/moddable` from the workspace root to populate the \
                 Moddable SDK (pinned via the c/moddable submodule), \
                 or place a prebuilt library in xsnap/prebuilt/libxs.a.",
                xs_sources.display(),
                prebuilt.display()
            );
        }
    }

    println!("cargo:rerun-if-changed=xsnap-platform.h");
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=prebuilt/libxs.a");
    // Link math and pthread
    println!("cargo:rustc-link-lib=m");
    println!("cargo:rustc-link-lib=pthread");
    println!("cargo:rustc-link-lib=dl");
}

fn compile_xs(manifest_dir: &PathBuf, moddable_dir: &PathBuf) {
    let xs_sources = moddable_dir.join("xs/sources");
    let xs_includes = moddable_dir.join("xs/includes");
    let xs_platforms = moddable_dir.join("xs/platforms");
    let platform_header = manifest_dir.join("xsnap-platform.h");

    let sources = [
        "xsAll.c",
        "xsAPI.c",
        "xsArguments.c",
        "xsArray.c",
        "xsAtomics.c",
        "xsBigInt.c",
        "xsBoolean.c",
        "xsCode.c",
        "xsCommon.c",
        "xsDataView.c",
        "xsDate.c",
        "xsDebug.c",
        "xsDefaults.c",
        "xsdtoa.c",
        "xsError.c",
        "xsFunction.c",
        "xsGenerator.c",
        "xsGlobal.c",
        "xsJSON.c",
        "xsLexical.c",
        "xsLockdown.c",
        "xsMapSet.c",
        "xsMarshall.c",
        "xsMath.c",
        "xsMemory.c",
        "xsModule.c",
        "xsNumber.c",
        "xsObject.c",
        "xsPlatforms.c",
        "xsProfile.c",
        "xsPromise.c",
        "xsProperty.c",
        "xsProxy.c",
        "xsre.c",
        "xsRegExp.c",
        "xsRun.c",
        "xsScope.c",
        "xsScript.c",
        "xsSnapshot.c",
        "xsSourceMap.c",
        "xsString.c",
        "xsSymbol.c",
        "xsSyntaxical.c",
        "xsTree.c",
        "xsType.c",
    ];

    let mut build = cc::Build::new();
    build
        .include(&xs_sources)
        .include(&xs_includes)
        .include(&xs_platforms)
        .include(manifest_dir)
        // Use our platform header instead of the GLib-dependent lin_xs.h
        .define(
            "XSPLATFORM",
            Some(
                format!("\"{}\"", platform_header.display()).as_str(),
            ),
        )
        .define("INCLUDE_XSPLATFORM", None)
        // Feature flags matching xsnap-pub
        .define("mxLockdown", Some("1"))
        .define("mxMetering", Some("1"))
        .define("mxParse", Some("1"))
        .define("mxRun", Some("1"))
        .define("mxSloppy", Some("1"))
        .define("mxSnapshot", Some("1"))
        .define("mxRegExpUnicodePropertyEscapes", Some("1"))
        .define("mxStringNormalize", Some("1"))
        .define("mxMinusZero", Some("1"))
        .define("mxBoundsCheck", Some("1"))
        .define("mxModuleStuff", Some("1"))
        // Canonicalize NaN so that every NaN produced by the engine
        // has the same bit pattern. Required for deterministic
        // snapshots and stable Map/Set keying.
        .define("mxCanonicalNaN", Some("1"))
        // CESU-8 internal string representation: encodes surrogate
        // pairs as two three-byte sequences rather than a single
        // four-byte UTF-8 sequence, giving O(1) indexing of BMP
        // characters and matching the internal representation used
        // by xst and xsnap-pub.
        .define("mxCESU8", Some("1"))
        // Per-machine LRU cache of string unicode-length / UTF-8
        // offset pairs. Makes indexing into large strings
        // (charAt, indexOf, slice) O(log n) amortized instead of
        // O(n) per access. Length 4 matches the xst reference.
        .define("mxStringInfoCacheLength", Some("4"));

    // When the "debug" cargo feature is enabled, activate the XS
    // debug subsystem (stepping, breakpoints, variable inspection)
    // and the instrumentation counters.
    if cfg!(feature = "debug") {
        build.define("mxDebug", Some("1"));
        build.define("mxInstrument", Some("1"));
    }

    build
        .flag("-fno-common")
        .flag("-Wno-misleading-indentation")
        .flag("-Wno-implicit-fallthrough")
        .flag("-Wno-unused-parameter")
        .flag("-Wno-sign-compare")
        .flag("-Wno-unused-variable")
        .opt_level(2);

    for source in &sources {
        build.file(xs_sources.join(source));
    }

    // Our platform stubs (replaces GLib-dependent lin_xs.c)
    build.file(manifest_dir.join("xsnap-platform.c"));

    build.compile("xs");
}

/// Compile a minimal C file that provides symbols missing from the
/// prebuilt libxs.a (e.g. fxRunDebugger, which the prebuilt may
/// not include).  This file does NOT #include xsAll.h — it only
/// uses opaque pointer types.
fn compile_platform_supplement(out_dir: &PathBuf) {
    let src = out_dir.join("xsnap-platform-supplement.c");
    std::fs::write(
        &src,
        r#"
/* Supplement for prebuilt libxs.a — provides symbols that the
   prebuilt may lack.  Uses weak symbols so that if the prebuilt
   already provides them, its definitions win. */

typedef struct sxMachine txMachine;

/* fxRunDebugger: no-op without mxDebug.  The prebuilt libxs.a
   was compiled without mxDebug so fxDebugCommand is absent. */
void __attribute__((weak)) fxRunDebugger(txMachine* the) {
    (void)the;
}
"#,
    )
    .expect("write platform supplement");

    cc::Build::new()
        .file(&src)
        .opt_level(2)
        .compile("xs_supplement");
}
