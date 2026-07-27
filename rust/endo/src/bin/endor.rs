//! Unified Endo binary.
//!
//! A single executable that can act as the top-level endo daemon
//! (the capability bus that routes envelopes among its children),
//! a worker, or a standalone archive runner. The subcommand picks
//! the role; the `-e` / `--engine` flag picks which engine runs
//! inside this process. XS is the default engine for every
//! child-facing subcommand.
//!
//!   endor daemon                # daemon / capability bus (foreground)
//!   endor start                 # detached daemon
//!   endor stop                  # graceful shutdown
//!   endor ping                  # liveness check
//!
//!   endor worker  [-e xs]       # supervised worker child
//!   endor run     [-e xs] <archive.zip>
//!                               # standalone archive runner
//!
//! The manager is hosted in-process by `endor daemon` on a
//! dedicated `std::thread`; there is no separate `manager`
//! subcommand. Set `ENDO_MANAGER_NODE=1` to fall back to the
//! legacy Node.js daemon child for one release.
//!
//! The optional `-e <engine>` flag makes the engine explicit. Future
//! engines (`-e wasm`, `-e native`) slot in without changing the
//! subcommand vocabulary.

use std::net::Shutdown;
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::process::ExitCode;

use endo::error::EndoError;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    let subcommand = match args.get(1) {
        Some(s) => s.as_str(),
        None => {
            print_help();
            return ExitCode::from(2);
        }
    };
    let rest = &args[2..];

    // All child-facing subcommands default to the XS engine;
    // `-e <engine>` makes it explicit.
    let engine = parse_engine(rest).unwrap_or("xs");

    match subcommand {
        "daemon" => match engine {
            "xs" => result_to_exit("endor", cmd_daemon()),
            other => unknown_engine(other),
        },
        "manager" => {
            // The `manager` subcommand has been removed. The daemon
            // now hosts the manager in-process on a dedicated
            // thread. Keep a one-line deprecation message for the
            // benefit of stale scripts; delete this arm in the next
            // release.
            eprintln!(
                "endor: the `manager` subcommand has been removed; \
                 `endor daemon` now hosts the manager in-process"
            );
            ExitCode::SUCCESS
        }
        "worker" => match engine {
            "xs" => xsnap_result_to_exit(unsafe { xsnap::run_xs_worker() }),
            other => unknown_engine(other),
        },
        "run" => {
            let cas_hash = parse_flag_value(rest, "--cas");
            let no_cas = rest.iter().any(|a| a == "--no-cas");
            let path = parse_positional_path(rest);
            match engine {
                "xs" => {
                    if let Some(hash) = cas_hash {
                        // Run from CAS root hash.
                        result_to_exit("endor", cmd_run_from_cas(&hash))
                    } else if let Some(ref p) = path {
                        if is_entry_module(p) {
                            result_to_exit("endor", cmd_run_entry(rest, p))
                        } else if no_cas {
                            xsnap_result_to_exit(xsnap::run_xs_archive(p))
                        } else {
                            result_to_exit("endor", cmd_run_with_cas(p))
                        }
                    } else {
                        eprintln!(
                            "usage: endor run [-e xs] [--cas <hash>] [--no-cas] [--registry <url>] [--offline] <archive.zip | entry.js>"
                        );
                        ExitCode::from(2)
                    }
                }
                other => unknown_engine(other),
            }
        }
        "start" => result_to_exit("endor", cmd_start()),
        "stop" => result_to_exit("endor", cmd_stop()),
        "ping" => result_to_exit("endor", cmd_ping()),
        "gc" => result_to_exit("endor", cmd_gc()),
        "npm-resolve" => result_to_exit("endor", cmd_npm_resolve(rest)),
        "registry" => result_to_exit("endor", cmd_registry(rest)),
        "-h" | "--help" => {
            print_help();
            ExitCode::SUCCESS
        }
        "help" => {
            match rest.first().map(|s| s.as_str()) {
                Some(sub) => print_subcommand_help(sub),
                None => print_help(),
            }
            ExitCode::SUCCESS
        }
        _ => {
            print_help();
            ExitCode::from(2)
        }
    }
}

fn print_help() {
    eprintln!("Usage: endor <command> [options]");
    eprintln!();
    eprintln!("Daemon commands (the daemon is the capability bus):");
    eprintln!("  daemon              Run the daemon in foreground");
    eprintln!("  start               Spawn the daemon in a detached session");
    eprintln!("  stop                Gracefully stop a running daemon");
    eprintln!("  ping                Verify daemon responsiveness");
    eprintln!();
    eprintln!("Child-facing commands (XS engine by default):");
    eprintln!("  worker  [-e xs]                Run a supervised worker child");
    eprintln!("  run     [-e xs] <archive.zip>  Run a compartment-map archive");
    eprintln!("  run     <entry.js>             Run an entry module, npm deps via CAS");
    eprintln!();
    eprintln!("Maintenance:");
    eprintln!("  gc                             Garbage-collect the CAS");
    eprintln!();
    eprintln!("NPM registry proxy:");
    eprintln!("  npm-resolve [--registry <url>] [--offline] <name[@range]>...");
    eprintln!("                                 Resolve and fetch an npm dependency");
    eprintln!("                                 graph into the CAS");
    eprintln!("  registry <list|meta|refresh|verify>");
    eprintln!("                                 Inspect and maintain the registry");
    eprintln!("                                 table (the proxy's cache index)");
}

fn print_subcommand_help(sub: &str) {
    match sub {
        "daemon" => {
            eprintln!("Usage: endor daemon");
            eprintln!();
            eprintln!("Run the Endo daemon in the foreground.");
            eprintln!();
            eprintln!("The daemon is the capability bus that routes envelopes among");
            eprintln!("workers. It hosts the JS manager in-process on a dedicated");
            eprintln!("thread (set ENDO_MANAGER_NODE=1 to use the legacy Node.js");
            eprintln!("daemon child instead).");
            eprintln!();
            eprintln!("Environment:");
            eprintln!("  ENDO_WORKER_THREADS   Tokio worker thread count (default: 4)");
            eprintln!("  ENDO_MANAGER_NODE     If set, use Node.js manager child");
            eprintln!("  ENDO_DAEMON_PATH      Path to Node.js daemon script (with ENDO_MANAGER_NODE)");
            eprintln!("  ENDO_DEFAULT_PLATFORM Default worker platform: separate, shared, node");
            eprintln!("  ENDO_TRACE            Enable trace logging");
        }
        "start" => {
            eprintln!("Usage: endor start");
            eprintln!();
            eprintln!("Spawn the daemon in a detached session.");
            eprintln!();
            eprintln!("If a daemon is already running (PID file exists and process is");
            eprintln!("alive), this is a no-op. Otherwise, forks a new daemon process");
            eprintln!("with setsid and waits up to 10 seconds for the Unix socket to");
            eprintln!("accept connections.");
        }
        "stop" => {
            eprintln!("Usage: endor stop");
            eprintln!();
            eprintln!("Gracefully stop a running daemon.");
            eprintln!();
            eprintln!("Sends SIGINT to the daemon process and waits up to 5 seconds");
            eprintln!("for it to exit.");
        }
        "ping" => {
            eprintln!("Usage: endor ping");
            eprintln!();
            eprintln!("Verify daemon responsiveness.");
            eprintln!();
            eprintln!("Connects to the daemon's Unix socket and immediately");
            eprintln!("disconnects. Prints \"pong\" on success; exits non-zero if");
            eprintln!("the daemon is not running or the socket is unreachable.");
        }
        "worker" => {
            eprintln!("Usage: endor worker [-e xs]");
            eprintln!();
            eprintln!("Run a supervised worker child.");
            eprintln!();
            eprintln!("This is not invoked directly — the daemon spawns worker");
            eprintln!("processes as needed. The worker communicates with the daemon");
            eprintln!("over fd 3 (read) and fd 4 (write) using CBOR-framed envelopes.");
            eprintln!();
            eprintln!("Options:");
            eprintln!("  -e, --engine <engine>  Engine to use (default: xs)");
        }
        "run" => {
            eprintln!("Usage: endor run [-e xs] [--registry <url>] [--offline] <archive.zip | entry.js>");
            eprintln!();
            eprintln!("Run a compartment-map archive, or an entry module, standalone.");
            eprintln!();
            eprintln!("A .zip archive executes in an XS machine without a running");
            eprintln!("daemon. Useful for testing and one-off execution.");
            eprintln!();
            eprintln!("A .js/.mjs/.cjs entry module instead resolves the entry");
            eprintln!("package's npm dependencies (Go-like minimal version");
            eprintln!("selection), fetches them content-addressed into the CAS,");
            eprintln!("assembles the compartment map binding them — no npm CLI,");
            eprintln!("no node_modules, no lockfile — and executes it in an XS");
            eprintln!("machine. A fully cached graph runs without network access.");
            eprintln!();
            eprintln!("The registry is configured npm-style: ~/.npmrc, then the");
            eprintln!("entry package's .npmrc, then NPM_CONFIG_REGISTRY, then");
            eprintln!("--registry. Supported .npmrc keys: registry,");
            eprintln!("@scope:registry, //host/path/:_authToken.");
            eprintln!();
            eprintln!("Options:");
            eprintln!("  -e, --engine <engine>  Engine to use (default: xs)");
            eprintln!("  --registry <url>       Registry base URL for entry-module runs");
            eprintln!("                         (default: https://registry.npmjs.org/)");
            eprintln!("  --offline              Refuse network access: only packages");
            eprintln!("                         already in the CAS and registry table");
            eprintln!("                         resolve");
        }
        "gc" => {
            eprintln!("Usage: endor gc");
            eprintln!();
            eprintln!("Garbage-collect the content-addressed store.");
            eprintln!();
            eprintln!("Removes CAS entries that have zero retained references and");
            eprintln!("are not transitively referenced by any live tree root.");
            eprintln!("Safe to run while the daemon is stopped.");
        }
        "npm-resolve" => {
            eprintln!("Usage: endor npm-resolve [--registry <url>] [--offline] <name[@range]>...");
            eprintln!();
            eprintln!("Resolve an npm dependency graph and fetch it into the CAS.");
            eprintln!();
            eprintln!("Each spec is a package name with an optional semver range");
            eprintln!("(default '*'), e.g. is-odd@^3.0.0 or @scope/pkg@~1.2.0.");
            eprintln!("Transitive dependencies are resolved with Go-like minimal");
            eprintln!("version selection, downloaded from the registry, verified,");
            eprintln!("stored content-addressed in the CAS, and recorded in the");
            eprintln!("registry table. Already-cached packages are never re-fetched,");
            eprintln!("so a fully cached graph resolves without network access.");
            eprintln!();
            eprintln!("Prints one line per resolved package:");
            eprintln!("  <name> <version> <tree-hash>");
            eprintln!();
            eprintln!("The registry is configured npm-style: ~/.npmrc, then the");
            eprintln!("current directory's .npmrc, then NPM_CONFIG_REGISTRY, then");
            eprintln!("--registry.");
            eprintln!();
            eprintln!("Options:");
            eprintln!("  --registry <url>  Registry base URL");
            eprintln!("                    (default: https://registry.npmjs.org/)");
            eprintln!("  --offline         Refuse network access: only cached");
            eprintln!("                    packages resolve");
        }
        "registry" => {
            eprintln!("Usage: endor registry <list [name] | meta [name] | refresh <name>... | verify>");
            eprintln!();
            eprintln!("Inspect and maintain the registry table, the SQLite index that");
            eprintln!("makes the CAS a cache of the npm registry.");
            eprintln!();
            eprintln!("Subcommands:");
            eprintln!("  list [name]       Print cached package versions, one");
            eprintln!("                    '<name> <version> <tree-hash>' per line");
            eprintln!("                    (all packages, or one package's versions)");
            eprintln!("  meta              Print cached version-listing rows, one");
            eprintln!("                    '<name> <fetched-at-unix>' per line");
            eprintln!("  meta <name>       Print the raw cached registry JSON for");
            eprintln!("                    one package");
            eprintln!("  refresh <name>... Invalidate the cached version listing so");
            eprintln!("                    the next resolution re-fetches it and can");
            eprintln!("                    observe newly published versions. Package");
            eprintln!("                    contents in the CAS are immutable and are");
            eprintln!("                    never invalidated.");
            eprintln!("  verify            Walk every cached package's CAS tree and");
            eprintln!("                    report entries whose blobs are missing;");
            eprintln!("                    exits non-zero if any package is");
            eprintln!("                    incomplete");
            eprintln!();
            eprintln!("The version-listing cache is write-once by design (the");
            eprintln!("registry-table-as-lock-file behaviour); 'refresh' is the");
            eprintln!("deliberate way to opt a package into seeing newer versions.");
        }
        "help" => {
            eprintln!("Usage: endor help [command]");
            eprintln!();
            eprintln!("Show help for a command. Without arguments, prints general usage.");
        }
        _ => {
            eprintln!("endor: unknown command '{sub}'");
            eprintln!();
            print_help();
        }
    }
}

fn result_to_exit(prog: &str, result: Result<(), EndoError>) -> ExitCode {
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("{prog}: {e}");
            ExitCode::from(1)
        }
    }
}

fn xsnap_result_to_exit(result: Result<(), xsnap::XsnapError>) -> ExitCode {
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("endor: {e}");
            ExitCode::from(1)
        }
    }
}

fn unknown_engine(engine: &str) -> ExitCode {
    eprintln!("endor: unknown engine: {engine}");
    ExitCode::from(2)
}

/// Returns the value of `-e <engine>` / `--engine=<engine>` if present
/// in `args`, else None. The flag may appear anywhere after the
/// subcommand.
fn parse_engine(args: &[String]) -> Option<&str> {
    let mut i = 0;
    while i < args.len() {
        let a = &args[i];
        if a == "-e" || a == "--engine" {
            if i + 1 < args.len() {
                return Some(args[i + 1].as_str());
            }
            return None;
        }
        if let Some(rest) = a.strip_prefix("--engine=") {
            return Some(rest);
        }
        if let Some(rest) = a.strip_prefix("-e=") {
            return Some(rest);
        }
        i += 1;
    }
    None
}

/// Returns the first positional argument (non-flag, non-flag-value).
fn parse_positional_path(args: &[String]) -> Option<PathBuf> {
    let mut i = 0;
    while i < args.len() {
        let a = &args[i];
        if a == "-e" || a == "--engine" || a == "--cas" || a == "--cas-dir" || a == "--registry" {
            // skip the flag value as well
            i += 2;
            continue;
        }
        if a.starts_with("--engine=") || a.starts_with("-e=")
            || a.starts_with("--cas=") || a.starts_with("--cas-dir=")
            || a.starts_with("--registry=")
        {
            i += 1;
            continue;
        }
        if a.starts_with('-') {
            i += 1;
            continue;
        }
        return Some(PathBuf::from(a));
    }
    None
}

/// Parse a flag with a value (e.g., --cas <hash>).
fn parse_flag_value<'a>(args: &'a [String], flag: &str) -> Option<&'a str> {
    let mut i = 0;
    while i < args.len() {
        if args[i] == flag {
            if i + 1 < args.len() {
                return Some(&args[i + 1]);
            }
            return None;
        }
        let prefix = format!("{flag}=");
        if let Some(rest) = args[i].strip_prefix(&prefix) {
            return Some(rest);
        }
        i += 1;
    }
    None
}

fn cmd_daemon() -> Result<(), EndoError> {
    let worker_threads = std::env::var("ENDO_WORKER_THREADS")
        .ok()
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(4);

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(worker_threads)
        .enable_all()
        .build()
        .map_err(|e| EndoError::Config(format!("tokio runtime: {e}")))?;

    runtime.block_on(async {
        let mut e = endo::endo::Endo::start()?;
        e.serve().await?;
        e.stop().await;
        Ok(())
    })
}

fn cmd_start() -> Result<(), EndoError> {
    let executable = std::env::current_exe()
        .map_err(|e| EndoError::Config(format!("current exe: {e}")))?
        .to_string_lossy()
        .to_string();
    let paths = endo::endo::start_detached(&executable)?;
    eprintln!("endor: started (log {})", paths.log_path.display());
    Ok(())
}

fn cmd_stop() -> Result<(), EndoError> {
    let paths = endo::endo::ensure_running()?;

    if let Ok(conn) = UnixStream::connect(&paths.sock_path) {
        let _ = conn.shutdown(Shutdown::Both);
    }

    let pid = endo::pidfile::read_pid(&paths.ephemeral_path)?;
    if pid != 0 && endo::pidfile::is_process_running(pid) {
        unsafe {
            libc::kill(pid as i32, libc::SIGINT);
        }
        for _ in 0..100 {
            if !endo::pidfile::is_process_running(pid) {
                return Ok(());
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        return Err(EndoError::Timeout(format!(
            "process {pid} did not exit within 5s"
        )));
    }

    Ok(())
}

fn cmd_ping() -> Result<(), EndoError> {
    let paths = endo::endo::ensure_running()?;
    let conn = UnixStream::connect(&paths.sock_path)?;
    let _ = conn.shutdown(Shutdown::Both);
    eprintln!("pong");
    Ok(())
}

/// A `.js`/`.mjs`/`.cjs` positional is an entry module for the
/// npm-registry-proxy path; anything else stays an archive.
fn is_entry_module(path: &std::path::Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()),
        Some("js") | Some("mjs") | Some("cjs")
    )
}

/// `endor run <entry.js>`: Phase 4 of
/// `designs/endor-npm-registry-proxy.md`, end to end. Resolves the
/// entry package's transitive npm dependencies (Go-like MVS),
/// fetches them content-addressed into the CAS (the registry table
/// as cache/lock file), ingests the entry package, stores the
/// compartment map binding them — then loads that map back out of
/// the CAS and executes it in an XS machine. State lives beside the
/// daemon's, as for `endor npm-resolve`.
fn cmd_run_entry(args: &[String], entry_path: &std::path::Path) -> Result<(), EndoError> {
    let offline = args.iter().any(|a| a == "--offline");

    // npm-style configuration: ~/.npmrc, then the entry package's
    // .npmrc, then NPM_CONFIG_REGISTRY, then the --registry flag.
    let (package_root, _) = endo::assemble::find_package_root(entry_path)
        .map_err(|e| EndoError::Config(format!("{e}")))?;
    let home = std::env::var_os("HOME").map(std::path::PathBuf::from);
    let mut config = endo::npmrc::NpmConfig::load(Some(&package_root), home.as_deref());
    if let Some(url) = parse_flag_value(args, "--registry") {
        config.set_default_registry(url);
    }

    let paths = endo::paths::resolve_paths()?;
    std::fs::create_dir_all(&paths.state_path)
        .map_err(|e| EndoError::Config(format!("state dir: {e}")))?;
    let cas = endo::cas::ContentStore::open(&paths.state_path.join("store-sha256"))
        .map_err(|e| EndoError::Config(format!("CAS open: {e}")))?;
    let registry_table =
        endo::registry::RegistryTable::open(&paths.state_path.join("registry.db"))
            .map_err(|e| EndoError::Config(format!("registry table open: {e}")))?;

    let http: Box<dyn endo::fetch::HttpClient> = if offline {
        Box::new(endo::fetch::OfflineClient)
    } else {
        Box::new(endo::fetch::UreqClient::with_config(config.clone()))
    };
    let http_ref: &dyn endo::fetch::HttpClient = http.as_ref();
    let assembled = endo::assemble::assemble_entry_with_config(
        &http_ref,
        &cas,
        &registry_table,
        &config,
        entry_path,
    )
    .map_err(|e| EndoError::Config(format!("{e}")))?;

    eprintln!(
        "endor[run]: assembled {} ({} packages)",
        assembled.package_name,
        assembled.resolution.len()
    );
    for package in assembled.resolution.packages() {
        eprintln!(
            "endor[run]:   {}@{} {}",
            package.name, package.version, package.tree_hash
        );
    }
    eprintln!("endor[run]: entry tree {}", assembled.entry_tree_hash);
    eprintln!(
        "endor[run]: compartment map {}",
        assembled.compartment_map_hash
    );

    let archive = endo::execute::load_assembled_archive(&cas, &assembled.compartment_map_hash)
        .map_err(|e| EndoError::Config(format!("{e}")))?;
    xsnap::run_xs_archive_loaded(&archive)
        .map_err(|e| EndoError::Config(format!("run: {e}")))?;
    Ok(())
}

fn cmd_run_with_cas(archive_path: &std::path::Path) -> Result<(), EndoError> {
    // Create a temporary CAS for standalone runs.
    let cas_dir = std::env::temp_dir().join("endor-cas");
    let cas = endo::cas::ContentStore::open(&cas_dir)
        .map_err(|e| EndoError::Config(format!("CAS open: {e}")))?;

    let bytes = std::fs::read(archive_path)
        .map_err(|e| EndoError::Config(format!("cannot open {}: {e}", archive_path.display())))?;
    let cursor = std::io::Cursor::new(&bytes);

    let ingested = endo::cas_archive::ingest_archive(&cas, cursor)
        .map_err(|e| EndoError::Config(format!("CAS ingest: {e}")))?;

    eprintln!("endor[run]: archive root {}", ingested.root_hash);

    // Run the archive using the loaded archive (already in memory).
    xsnap::run_xs_archive_loaded(&ingested.archive)
        .map_err(|e| EndoError::Config(format!("run: {e}")))?;
    Ok(())
}

fn cmd_run_from_cas(root_hash: &str) -> Result<(), EndoError> {
    let cas_dir = std::env::temp_dir().join("endor-cas");
    let cas = endo::cas::ContentStore::open(&cas_dir)
        .map_err(|e| EndoError::Config(format!("CAS open: {e}")))?;

    let archive = endo::cas_archive::load_archive_from_cas(&cas, root_hash)
        .map_err(|e| EndoError::Config(format!("CAS load: {e}")))?;

    xsnap::run_xs_archive_loaded(&archive)
        .map_err(|e| EndoError::Config(format!("run: {e}")))?;
    Ok(())
}

fn cmd_gc() -> Result<(), EndoError> {
    let paths = endo::paths::resolve_paths()?;
    let cas_dir = paths.state_path.join("store-sha256");
    if !cas_dir.exists() {
        eprintln!("endor gc: no CAS directory at {}", cas_dir.display());
        return Ok(());
    }
    let cas = endo::cas::ContentStore::open(&cas_dir)?;
    let live_roots = std::collections::HashSet::new();
    let report = cas.gc(&live_roots)?;
    eprintln!(
        "endor gc: freed {} entries ({} bytes)",
        report.freed_count, report.freed_bytes
    );
    Ok(())
}

fn cmd_npm_resolve(args: &[String]) -> Result<(), EndoError> {
    let mut offline = false;

    // Positional specs: every argument that is not a flag or a flag
    // value.
    let mut roots: Vec<(String, String)> = Vec::new();
    let mut skip_next = false;
    for a in args {
        if skip_next {
            skip_next = false;
            continue;
        }
        if a == "--registry" || a == "-e" || a == "--engine" {
            skip_next = true;
            continue;
        }
        if a == "--offline" {
            offline = true;
            continue;
        }
        if a.starts_with("--") {
            return Err(EndoError::Config(format!("unknown flag: {a}")));
        }
        roots.push(parse_package_spec(a));
    }
    if roots.is_empty() {
        return Err(EndoError::Config(
            "usage: endor npm-resolve [--registry <url>] [--offline] <name[@range]>...".to_string(),
        ));
    }

    // npm-style configuration: ~/.npmrc, then the current
    // directory's .npmrc, then NPM_CONFIG_REGISTRY, then --registry.
    let cwd = std::env::current_dir().ok();
    let home = std::env::var_os("HOME").map(std::path::PathBuf::from);
    let mut config = endo::npmrc::NpmConfig::load(cwd.as_deref(), home.as_deref());
    if let Some(url) = parse_flag_value(args, "--registry") {
        config.set_default_registry(url);
    }

    let paths = endo::paths::resolve_paths()?;
    std::fs::create_dir_all(&paths.state_path)
        .map_err(|e| EndoError::Config(format!("state dir: {e}")))?;
    let cas = endo::cas::ContentStore::open(&paths.state_path.join("store-sha256"))
        .map_err(|e| EndoError::Config(format!("CAS open: {e}")))?;
    let registry_table =
        endo::registry::RegistryTable::open(&paths.state_path.join("registry.db"))
            .map_err(|e| EndoError::Config(format!("registry table open: {e}")))?;

    let http: Box<dyn endo::fetch::HttpClient> = if offline {
        Box::new(endo::fetch::OfflineClient)
    } else {
        Box::new(endo::fetch::UreqClient::with_config(config.clone()))
    };
    let http_ref: &dyn endo::fetch::HttpClient = http.as_ref();
    let resolved = endo::npm_resolve::resolve_transitive_with_config(
        &http_ref,
        &cas,
        &registry_table,
        &config,
        &roots,
    )
    .map_err(|e| EndoError::Config(format!("npm-resolve: {e}")))?;

    for p in &resolved {
        println!("{} {} {}", p.name, p.version, p.tree_hash);
    }
    eprintln!("endor npm-resolve: {} packages resolved", resolved.len());
    Ok(())
}

fn open_registry_table(
    paths: &endo::paths::EndoPaths,
) -> Result<endo::registry::RegistryTable, EndoError> {
    std::fs::create_dir_all(&paths.state_path)
        .map_err(|e| EndoError::Config(format!("state dir: {e}")))?;
    endo::registry::RegistryTable::open(&paths.state_path.join("registry.db"))
        .map_err(|e| EndoError::Config(format!("registry table open: {e}")))
}

fn cmd_registry(args: &[String]) -> Result<(), EndoError> {
    let usage = "usage: endor registry <list [name] | meta [name] | refresh <name>... | verify>";
    let paths = endo::paths::resolve_paths()?;
    match args.first().map(|s| s.as_str()) {
        Some("list") => {
            let table = open_registry_table(&paths)?;
            let entries = match args.get(1) {
                Some(name) => table.list_versions(name),
                None => table.list_packages(),
            }
            .map_err(|e| EndoError::Config(format!("registry list: {e}")))?;
            for p in &entries {
                println!("{} {} {}", p.name, p.version, p.hash);
            }
            eprintln!("endor registry: {} package(s) cached", entries.len());
            Ok(())
        }
        Some("meta") => {
            let table = open_registry_table(&paths)?;
            match args.get(1) {
                Some(name) => {
                    let json = table
                        .get_meta(name)
                        .map_err(|e| EndoError::Config(format!("registry meta: {e}")))?
                        .ok_or_else(|| {
                            EndoError::Config(format!("no cached metadata for {name}"))
                        })?;
                    println!("{json}");
                    Ok(())
                }
                None => {
                    let metas = table
                        .list_meta()
                        .map_err(|e| EndoError::Config(format!("registry meta: {e}")))?;
                    for m in &metas {
                        println!("{} {}", m.name, m.fetched_at);
                    }
                    eprintln!("endor registry: {} metadata row(s) cached", metas.len());
                    Ok(())
                }
            }
        }
        Some("refresh") => {
            let names = &args[1..];
            if names.is_empty() {
                return Err(EndoError::Config(
                    "usage: endor registry refresh <name>...".to_string(),
                ));
            }
            let table = open_registry_table(&paths)?;
            for name in names {
                let existed = table
                    .delete_meta(name)
                    .map_err(|e| EndoError::Config(format!("registry refresh: {e}")))?;
                if existed {
                    eprintln!("endor registry: invalidated version listing for {name}");
                } else {
                    eprintln!("endor registry: no cached metadata for {name}");
                }
            }
            Ok(())
        }
        Some("verify") => {
            let table = open_registry_table(&paths)?;
            let cas = endo::cas::ContentStore::open(&paths.state_path.join("store-sha256"))
                .map_err(|e| EndoError::Config(format!("CAS open: {e}")))?;
            let entries = table
                .list_packages()
                .map_err(|e| EndoError::Config(format!("registry verify: {e}")))?;
            let mut incomplete = 0u64;
            for p in &entries {
                if let Err(detail) = verify_cas_tree(&cas, &p.hash) {
                    incomplete += 1;
                    println!("MISSING {} {} {} {}", p.name, p.version, p.hash, detail);
                }
            }
            eprintln!(
                "endor registry: {} package(s) verified, {} incomplete",
                entries.len(),
                incomplete
            );
            if incomplete > 0 {
                return Err(EndoError::Config(format!(
                    "{incomplete} package tree(s) incomplete in the CAS"
                )));
            }
            Ok(())
        }
        _ => Err(EndoError::Config(usage.to_string())),
    }
}

/// Walk a CAS tree recursively; report the first unreadable tree or
/// missing blob as a short human-readable detail.
fn verify_cas_tree(cas: &endo::cas::ContentStore, hash: &str) -> Result<(), String> {
    let tree = cas
        .read_tree(hash)
        .map_err(|e| format!("tree {hash}: {e}"))?;
    for (name, entry) in &tree.entries {
        if entry.entry_type == "tree" {
            verify_cas_tree(cas, &entry.hash)
                .map_err(|detail| format!("{name}: {detail}"))?;
        } else if !cas.has(&entry.hash) {
            return Err(format!("blob {} ({name}) missing", entry.hash));
        }
    }
    Ok(())
}

/// Split a `name[@range]` spec, keeping the `@` of a scoped name
/// (`@scope/pkg@^1.0.0` → (`@scope/pkg`, `^1.0.0`)). A bare name
/// resolves as `*`.
fn parse_package_spec(spec: &str) -> (String, String) {
    match spec[1..].rfind('@') {
        Some(i) => (spec[..i + 1].to_string(), spec[i + 2..].to_string()),
        None => (spec.to_string(), "*".to_string()),
    }
}
