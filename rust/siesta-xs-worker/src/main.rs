//! siesta-xs-worker: a minimal snapshottable XS runner for `@endo/siesta`
//! workers.
//!
//! Deliberately NOT the endor supervisor: no powers, no daemon bundles,
//! no bus protocol. One XS machine runs the siesta worker shell (SES +
//! CapTP + guest compartment); the host talks newline-delimited JSON over
//! fd 3 (host -> worker) and fd 4 (worker -> host). All JSON crossing the
//! boundary is ASCII (the JS sides escape non-ASCII), so CESU-8/UTF-8/C
//! string encodings coincide.
//!
//! Protocol, host to worker:
//!   {"op":"deliver","message":<captp message>}   -> zero or more
//!       {"op":"outbound","message":...} then {"op":"ack"}
//!   {"op":"snapshot"}       -> {"op":"snapshot-ok","ref":"<sha256hex>"}
//!   {"op":"exit"}           -> process exits 0
//!
//! Worker to host, unsolicited: {"op":"outbound","message":...} (only
//! within a delivery turn; the shell is reactive).
//!
//! Startup: {"op":"ready"} once the machine is booted (fresh: polyfills,
//! SES boot, worker bundle; restore: heap snapshot from the CAS, no
//! re-evaluation — orthogonal persistence means the shell never knows).

use std::cell::RefCell;
use std::fs::File;
use std::io::{BufRead, BufReader, BufWriter, Read, Write};
use std::os::fd::FromRawFd;
use std::path::PathBuf;
use std::process::exit;

use serde::Deserialize;
use serde_json::value::RawValue;
use xsnap::ffi::XsMachine;
use xsnap::worker_io::arg_str;
use xsnap::{ensure_shared_cluster, Machine, MANAGER_CREATION};

/// Tag validating that a snapshot was produced by a compatible
/// siesta-xs-worker (host-callback table layout:
/// [siestaSend, siestaTrace, harden, lockdown]).
const SNAPSHOT_SIGNATURE: &[u8] = b"siesta-xs 3";

thread_local! {
    static OUTBOUND: RefCell<Vec<String>> = const { RefCell::new(Vec::new()) };
}

/// Host function `siestaSend(json)`: the worker shell emits one outbound
/// CapTP message (an ASCII JSON string).
unsafe extern "C" fn host_siesta_send(the: *mut XsMachine) {
    let message = arg_str(the, 0);
    OUTBOUND.with(|queue| queue.borrow_mut().push(message));
}

/// Host function `siestaTrace(text)`: worker diagnostics to stderr.
unsafe extern "C" fn host_siesta_trace(the: *mut XsMachine) {
    let text = arg_str(the, 0);
    eprintln!("siesta-xs-worker: [trace] {text}");
}

fn snapshot_callbacks() -> Vec<xsnap::ffi::XsCallback> {
    vec![
        host_siesta_send,
        host_siesta_trace,
        xsnap::ffi::fx_harden,
        xsnap::ffi::fx_lockdown,
    ]
}

#[derive(Deserialize)]
struct Envelope<'a> {
    op: String,
    #[serde(borrow)]
    message: Option<&'a RawValue>,
}

struct Args {
    boot: PathBuf,
    bundle: PathBuf,
    cas: PathBuf,
    restore: Option<String>,
}

fn parse_args() -> Args {
    let mut boot = None;
    let mut bundle = None;
    let mut cas = None;
    let mut restore = None;
    let mut argv = std::env::args().skip(1);
    while let Some(flag) = argv.next() {
        let mut value = || {
            argv.next()
                .unwrap_or_else(|| fatal(&format!("missing value for {flag}")))
        };
        match flag.as_str() {
            "--boot" => boot = Some(PathBuf::from(value())),
            "--bundle" => bundle = Some(PathBuf::from(value())),
            "--cas" => cas = Some(PathBuf::from(value())),
            "--restore" => restore = Some(value()),
            _ => fatal(&format!("unknown flag {flag}")),
        }
    }
    Args {
        boot: boot.unwrap_or_else(|| fatal("--boot <ses-boot.js> required")),
        bundle: bundle.unwrap_or_else(|| fatal("--bundle <worker-xs.js> required")),
        cas: cas.unwrap_or_else(|| fatal("--cas <dir> required")),
        restore,
    }
}

fn fatal(message: &str) -> ! {
    eprintln!("siesta-xs-worker: {message}");
    exit(2)
}

fn read_file(path: &PathBuf) -> String {
    let mut text = String::new();
    File::open(path)
        .unwrap_or_else(|e| fatal(&format!("cannot open {}: {e}", path.display())))
        .read_to_string(&mut text)
        .unwrap_or_else(|e| fatal(&format!("cannot read {}: {e}", path.display())));
    text
}

/// Evaluates a script, capturing any thrown error's message and stack
/// into a global for diagnosis (Machine::eval alone reports None).
fn eval_script(machine: &Machine, source: &str, label: &str) {
    let mut wrapped = String::with_capacity(source.len() + 256);
    wrapped.push_str("globalThis.__siesta_boot_err = ''; try {\n");
    wrapped.push_str(source);
    // The trailing statement pins the script's completion value to a
    // primitive: Machine::eval cannot represent object completions.
    wrapped.push_str(
        "\n} catch (e) { globalThis.__siesta_boot_err = \
         'ERROR: ' + (e && e.message) + '\\n' + ((e && e.stack) || ''); }\n0;",
    );
    machine
        .eval(&wrapped)
        .unwrap_or_else(|| fatal(&format!("{label}: evaluation failed outright")));
    let err = machine
        .eval_to_string("globalThis.__siesta_boot_err")
        .unwrap_or_default();
    if !err.is_empty() {
        fatal(&format!("{label}: {err}"));
    }
}

fn make_fresh_machine(args: &Args) -> Machine {
    // MANAGER_CREATION rather than WORKER_CREATION: the worker-shell
    // bundle (captp + marshal + eventual-send shim) needs the larger
    // parser buffer and stack.
    let machine = Machine::new(&MANAGER_CREATION, "siesta-worker")
        .unwrap_or_else(|| fatal("could not allocate XS machine"));
    machine.define_function("siestaSend", host_siesta_send, 1);
    machine.define_function("siestaTrace", host_siesta_trace, 1);
    // XS implements Hardened JavaScript natively (mxLockdown): expose
    // the engine's own harden and lockdown to the boot script, exactly
    // as xst does. The boot script calls lockdown() after polyfills.
    machine.define_function("harden", xsnap::ffi::fx_harden, 1);
    machine.define_function("lockdown", xsnap::ffi::fx_lockdown, 0);
    // The boot file owns everything pre-bundle: any pre-lockdown
    // polyfills and the lockdown call.
    eval_script(&machine, &read_file(&args.boot), "ses-boot");
    machine.quiesce();
    eval_script(&machine, &read_file(&args.bundle), "worker-bundle");
    machine.quiesce();
    machine
}

fn restore_machine(args: &Args, hash: &str) -> Machine {
    let mut callbacks = snapshot_callbacks();
    Machine::resume_from_cas(
        &args.cas,
        hash,
        "siesta-worker",
        SNAPSHOT_SIGNATURE,
        &mut callbacks,
    )
    .unwrap_or_else(|e| fatal(&format!("cannot restore snapshot {hash}: {e}")))
}

fn drain_outbound(writer: &mut impl Write) {
    let messages = OUTBOUND.with(|queue| queue.borrow_mut().split_off(0));
    for message in messages {
        // `message` is already ASCII JSON produced by the shell.
        writeln!(writer, "{{\"op\":\"outbound\",\"message\":{message}}}")
            .unwrap_or_else(|e| fatal(&format!("write failed: {e}")));
    }
}

fn main() {
    let args = parse_args();
    ensure_shared_cluster();

    let machine = match &args.restore {
        Some(hash) => restore_machine(&args, hash),
        None => make_fresh_machine(&args),
    };

    // fd 3: host -> worker; fd 4: worker -> host. The spawning engine
    // adapter provides both as pipes.
    let reader = BufReader::new(unsafe { File::from_raw_fd(3) });
    let mut writer = BufWriter::new(unsafe { File::from_raw_fd(4) });

    let send_line = |writer: &mut BufWriter<File>, line: &str| {
        writeln!(writer, "{line}").unwrap_or_else(|e| fatal(&format!("write failed: {e}")));
        writer
            .flush()
            .unwrap_or_else(|e| fatal(&format!("flush failed: {e}")));
    };

    send_line(&mut writer, "{\"op\":\"ready\"}");

    for line in reader.lines() {
        let line = line.unwrap_or_else(|e| fatal(&format!("read failed: {e}")));
        if line.is_empty() {
            continue;
        }
        let envelope: Envelope =
            serde_json::from_str(&line).unwrap_or_else(|e| fatal(&format!("bad envelope: {e}")));
        match envelope.op.as_str() {
            "deliver" => {
                let message = envelope
                    .message
                    .unwrap_or_else(|| fatal("deliver without message"));
                // The raw message text is ASCII JSON; embed it as a JS
                // string literal via JSON encoding of the text itself.
                let literal = serde_json::to_string(message.get())
                    .unwrap_or_else(|e| fatal(&format!("encode failed: {e}")));
                let call = format!("globalThis.siestaDispatch({literal});");
                eval_script(&machine, &call, "dispatch");
                machine.quiesce();
                drain_outbound(&mut writer);
                send_line(&mut writer, "{\"op\":\"ack\"}");
            }
            "snapshot" => {
                machine.quiesce();
                let hash = machine
                    .suspend_to_cas(SNAPSHOT_SIGNATURE, &args.cas)
                    .unwrap_or_else(|e| fatal(&format!("snapshot failed: {e}")));
                send_line(
                    &mut writer,
                    &format!("{{\"op\":\"snapshot-ok\",\"ref\":\"{hash}\"}}"),
                );
            }
            "exit" => {
                exit(0);
            }
            other => fatal(&format!("unknown op {other}")),
        }
    }
}
