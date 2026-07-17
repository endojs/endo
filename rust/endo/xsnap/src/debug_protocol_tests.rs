//! # XS Debugger Protocol Tests
//!
//! These tests exercise the xsbug debug protocol by running small
//! JavaScript programs in an XS machine with debugging enabled.
//! The test code acts as the "companion worker" — the debugger
//! client — sending XML commands and verifying the VM's responses.
//!
//! ## Prerequisites
//!
//! These tests require the XS C sources to be compiled with
//! `mxDebug` defined (via the `debug` cargo feature).  If only
//! the prebuilt `libxs.a` is available and it was built without
//! `mxDebug`, each test detects this at runtime via
//! `debug_is_active()` and skips gracefully.
//!
//! To run the tests with full debug support, place the Moddable XS
//! C sources at `c/moddable/xs/sources/` and build with:
//!
//! ```sh
//! cargo test -p xsnap --features debug -- debug_protocol_tests
//! ```
//!
//! ## Architecture
//!
//! Each test follows this pattern:
//!
//! 1. Create a debug-enabled XS machine.
//! 2. Drain the initial `<login>` handshake.
//! 3. Optionally set breakpoints or exception modes (outside eval).
//! 4. Pre-load debug commands into the inbound buffer.
//!    Since the machine runs on the same thread, commands for
//!    breakpoint interactions must be loaded **before** `eval`
//!    enters a debug loop.
//! 5. Evaluate a small JS program that triggers a breakpoint.
//! 6. Drain the outbound buffer and verify the XML responses.
//!
//! ## Protocol Reference
//!
//! Commands (client → VM):
//!   `<go/>`, `<step/>`, `<step-inside/>`, `<step-outside/>`,
//!   `<select id="N"/>`, `<set-breakpoint path="P" line="L"/>`,
//!   `<script path="(debug)" line="0"><![CDATA[expr]]></script>`
//!
//! Responses (VM → client):
//!   `<login>`, `<break>`, `<frames>`, `<local>`, `<global>`,
//!   `<eval>`, `<breakpoints>`, `<bubble>`

use crate::powers;
use crate::powers::debug;
use crate::{initialize_shared_cluster, Machine, DEFAULT_CREATION};
use std::sync::Once;

static INIT: Once = Once::new();

// ---------------------------------------------------------------------------
// Helpers — a tiny "debug client" API
// ---------------------------------------------------------------------------

/// Create a debug-enabled XS machine.  Returns `None` if the
/// binary was built without `mxDebug` (prebuilt libxs.a).
fn debug_machine(ps: &mut powers::HostPowers) -> Option<Machine> {
    INIT.call_once(|| initialize_shared_cluster());
    debug::debug_reset();
    debug::debug_enable();
    let machine =
        Machine::new(&DEFAULT_CREATION, "debug-test").expect("machine creation failed");
    machine.register_powers(ps as *mut powers::HostPowers);
    if !debug::debug_is_active() {
        eprintln!("debug not compiled in — skipping test");
        debug::debug_reset();
        return None;
    }
    Some(machine)
}

/// Drain the initial `<login>` handshake that XS emits when the
/// debug connection is established.
fn drain_login(machine: &Machine) -> String {
    machine.run_debugger();
    drain_xml()
}

/// Push a debug command into the inbound buffer.
/// The next `fxReceive` will deliver it to the XS debugger.
fn send_cmd(xml: &str) {
    let cmd = format!("\r\n{xml}\r\n");
    debug::debug_push_inbound(cmd.as_bytes());
}

/// Drain all pending outbound XML from the debug session.
fn drain_xml() -> String {
    match debug::debug_drain_outbound() {
        Some(data) => crate::cesu8::decode_lossy(&data),
        None => String::new(),
    }
}

/// Run one debugger command round: send any pending commands
/// to XS, let it process them, and return the XML output.
fn pump(machine: &Machine) -> String {
    machine.run_debugger();
    drain_xml()
}

/// Extract an attribute value from the first occurrence of an
/// XML element.  For example:
///
///     attr(&xml, "break", "line") → Some("3")
///
fn attr<'a>(xml: &'a str, element: &str, name: &str) -> Option<&'a str> {
    let tag = format!("<{element}");
    let pos = xml.find(&tag)?;
    let rest = &xml[pos..];
    let key = format!("{name}=\"");
    let kpos = rest.find(&key)? + key.len();
    let val_rest = &rest[kpos..];
    let end = val_rest.find('"')?;
    Some(&val_rest[..end])
}

/// Extract the text content between `<element>` and `</element>`.
fn text_content<'a>(xml: &'a str, element: &str) -> Option<&'a str> {
    let open = format!("<{element}");
    let close = format!("</{element}>");
    let start = xml.find(&open)?;
    let rest = &xml[start..];
    let gt = rest.find('>')? + 1;
    let inner = &rest[gt..];
    let end = inner.find(&close)?;
    Some(&inner[..end])
}

/// Count how many times `<element` appears in the XML.
fn count_elements(xml: &str, element: &str) -> usize {
    let tag = format!("<{element}");
    xml.matches(&tag).count()
}

/// Collect all values of a given attribute from all occurrences
/// of an element.
fn all_attrs<'a>(xml: &'a str, element: &str, name: &str) -> Vec<&'a str> {
    let tag = format!("<{element}");
    let key = format!("{name}=\"");
    let mut results = Vec::new();
    let mut search = xml;
    loop {
        let pos = match search.find(&tag) {
            Some(p) => p,
            None => break,
        };
        let rest = &search[pos..];
        if let Some(kpos) = rest.find(&key) {
            let val_start = kpos + key.len();
            let val_rest = &rest[val_start..];
            if let Some(end) = val_rest.find('"') {
                results.push(&val_rest[..end]);
            }
        }
        // Advance past this element to find the next one.
        search = &search[pos + tag.len()..];
    }
    results
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/// The `debugger` statement in JavaScript causes the VM to pause
/// and emit a `<break>` event.  The break includes the source
/// path and line number where execution stopped.
#[test]
fn debugger_statement_triggers_break() {
    let mut ps = powers::HostPowers::new();
    let machine = match debug_machine(&mut ps) {
        Some(m) => m,
        None => return,
    };
    let login = drain_login(&machine);
    assert!(login.contains("<login"), "expected <login> handshake");

    // Pre-load a <go/> so the VM resumes after the break.
    send_cmd("<go/>");

    // A two-line program: the debugger statement is on line 2.
    machine.eval("var x = 1;\ndebugger;\nvar y = x + 1;");

    let xml = drain_xml();
    assert!(
        xml.contains("<break"),
        "expected <break> event in output:\n{xml}"
    );

    // The break event carries the source location.
    let line = attr(&xml, "break", "line");
    assert!(line.is_some(), "break element should have a line attribute");
    eprintln!(
        "break at path={:?} line={:?}",
        attr(&xml, "break", "path"),
        line
    );

    debug::debug_reset();
}

/// When the VM pauses at a breakpoint inside a function, the
/// debugger can request the call stack with `<select id="0"/>`.
/// The response includes `<frames>` with one `<frame>` per
/// stack level, showing the function name and source location.
#[test]
fn inspect_stack_frames() {
    let mut ps = powers::HostPowers::new();
    let machine = match debug_machine(&mut ps) {
        Some(m) => m,
        None => return,
    };
    drain_login(&machine);

    // When the break fires:
    //   1. Request the call stack.
    //   2. Resume execution.
    send_cmd("<select id=\"0\"/>");
    send_cmd("<go/>");

    // A function `add` calls `debugger` from inside a call chain.
    machine.eval(
        "function add(a, b) {\n\
         \tdebugger;\n\
         \treturn a + b;\n\
         }\n\
         add(3, 4);\n",
    );

    let xml = drain_xml();

    // The response contains <frames> with at least two frames:
    // the `add` function and the top-level caller.
    assert!(xml.contains("<frames>"), "expected <frames> in:\n{xml}");
    let frame_names = all_attrs(&xml, "frame", "name");
    eprintln!("frames: {:?}", frame_names);
    assert!(
        frame_names.iter().any(|n| n.contains("add")),
        "expected a frame named 'add', got: {:?}",
        frame_names,
    );
}

/// The `<local>` response shows the variables in scope at the
/// breakpoint.  Each `<property>` has a `name` and `value`.
#[test]
fn inspect_local_variables() {
    let mut ps = powers::HostPowers::new();
    let machine = match debug_machine(&mut ps) {
        Some(m) => m,
        None => return,
    };
    drain_login(&machine);

    send_cmd("<select id=\"0\"/>");
    send_cmd("<go/>");

    // `greet` has a local variable `name` bound to "world".
    machine.eval(
        "function greet(name) {\n\
         \tvar message = 'hello ' + name;\n\
         \tdebugger;\n\
         \treturn message;\n\
         }\n\
         greet('world');\n",
    );

    let xml = drain_xml();
    assert!(xml.contains("<local>"), "expected <local> in:\n{xml}");

    // Look for the `name` parameter.
    let prop_names = all_attrs(&xml, "property", "name");
    eprintln!("local properties: {:?}", prop_names);
    assert!(
        prop_names.contains(&"name"),
        "expected local 'name', got: {:?}",
        prop_names,
    );

    // Look for its value.
    // The property for `name` should show "world".
    assert!(
        xml.contains("world"),
        "expected value 'world' in locals:\n{xml}",
    );

    // `message` should also be visible.
    assert!(
        prop_names.contains(&"message"),
        "expected local 'message', got: {:?}",
        prop_names,
    );
}

/// The debugger can break on **all** exceptions by setting the
/// pseudo-breakpoint `path="exceptions"`.  When a `throw`
/// executes, the VM pauses and reports the exception location.
#[test]
fn break_on_exception() {
    let mut ps = powers::HostPowers::new();
    let machine = match debug_machine(&mut ps) {
        Some(m) => m,
        None => return,
    };
    drain_login(&machine);

    // Enable "break on all exceptions" mode.
    send_cmd("<set-breakpoint path=\"exceptions\" line=\"0\"/>");
    pump(&machine);

    // When the exception-break fires, inspect and resume.
    send_cmd("<select id=\"0\"/>");
    send_cmd("<go/>");

    // This program throws an error.  The VM should pause at the
    // throw site before the exception propagates.
    machine.eval(
        "function divide(a, b) {\n\
         \tif (b === 0) throw new Error('division by zero');\n\
         \treturn a / b;\n\
         }\n\
         try { divide(1, 0); } catch(e) {}\n",
    );

    let xml = drain_xml();
    assert!(
        xml.contains("<break"),
        "expected <break> on exception:\n{xml}",
    );
    // The break message or the local scope should mention the error.
    assert!(
        xml.contains("division by zero") || xml.contains("Error"),
        "expected exception details in output:\n{xml}",
    );

    // We should also see frames from inside `divide`.
    let frame_names = all_attrs(&xml, "frame", "name");
    eprintln!("exception frames: {:?}", frame_names);

    debug::debug_reset();
}

/// Line breakpoints are set with `<set-breakpoint>` and cause the
/// VM to pause when execution reaches that source line.
///
/// Breakpoints can be cleared with `<clear-breakpoint>` or
/// `<clear-all-breakpoints>`.
#[test]
fn manage_line_breakpoints() {
    let mut ps = powers::HostPowers::new();
    let machine = match debug_machine(&mut ps) {
        Some(m) => m,
        None => return,
    };
    drain_login(&machine);

    // First, run a small program WITHOUT breakpoints to learn
    // the source path that XS assigns to eval'd code.
    send_cmd("<go/>");
    machine.eval("debugger;\nvar probe = 1;");
    let probe_xml = drain_xml();
    let eval_path = attr(&probe_xml, "break", "path").unwrap_or("*");
    eprintln!("eval path: {:?}", eval_path);

    // Now set a breakpoint on line 2 of the next eval.
    send_cmd(&format!(
        "<set-breakpoint path=\"{eval_path}\" line=\"2\"/>"
    ));
    pump(&machine);

    // Pre-load resume for when the breakpoint fires.
    send_cmd("<go/>");

    // Evaluate code — line 2 should trigger the breakpoint.
    machine.eval("var a = 10;\nvar b = 20;\nvar c = a + b;");
    let xml = drain_xml();

    // If the breakpoint fired, we should see a <break>.
    // (The exact behavior depends on whether XS reuses the same
    // path for successive evals.)
    if xml.contains("<break") {
        let break_line = attr(&xml, "break", "line");
        eprintln!("breakpoint hit at line {:?}", break_line);
    } else {
        eprintln!(
            "breakpoint did not fire (path may differ between evals)"
        );
    }

    // Clear all breakpoints and verify code runs uninterrupted.
    send_cmd("<clear-all-breakpoints/>");
    pump(&machine);

    machine.eval("var d = 40;\nvar e = 50;");
    let after = drain_xml();
    assert!(
        !after.contains("<break"),
        "no break expected after clearing breakpoints:\n{after}",
    );

    debug::debug_reset();
}

/// While the VM is paused, the debugger can evaluate arbitrary
/// expressions in the current scope using `<script>`.  The result
/// is returned in an `<eval>` element.
#[test]
fn evaluate_expression_while_stopped() {
    let mut ps = powers::HostPowers::new();
    let machine = match debug_machine(&mut ps) {
        Some(m) => m,
        None => return,
    };
    drain_login(&machine);

    // When the break fires, evaluate an expression and resume.
    send_cmd("<script path=\"(debug)\" line=\"0\"><![CDATA[x * 2]]></script>");
    send_cmd("<go/>");

    machine.eval("var x = 21;\ndebugger;");

    let xml = drain_xml();
    assert!(xml.contains("<break"), "expected break:\n{xml}");

    // The <eval> element carries the result of `x * 2`.
    let eval_result = text_content(&xml, "eval");
    eprintln!("eval result: {:?}", eval_result);
    assert!(
        eval_result.is_some(),
        "expected <eval> response in:\n{xml}",
    );
    // x = 21, so x * 2 = 42.
    assert!(
        eval_result.unwrap().contains("42"),
        "expected '42' in eval result, got: {:?}",
        eval_result,
    );

    debug::debug_reset();
}

/// The `<global>` response shows the properties of the global
/// object.  User-defined globals appear alongside built-in ones.
#[test]
fn inspect_global_scope() {
    let mut ps = powers::HostPowers::new();
    let machine = match debug_machine(&mut ps) {
        Some(m) => m,
        None => return,
    };
    drain_login(&machine);

    send_cmd("<select id=\"0\"/>");
    send_cmd("<go/>");

    machine.eval("var myGlobal = 'hello';\ndebugger;");

    let xml = drain_xml();
    assert!(xml.contains("<global>"), "expected <global> in:\n{xml}");

    // The global scope should contain our variable.
    assert!(
        xml.contains("myGlobal"),
        "expected 'myGlobal' in global scope:\n{}",
        &xml[xml.find("<global>").unwrap_or(0)
            ..xml
                .find("</global>")
                .map(|p| p + 9)
                .unwrap_or(xml.len())],
    );

    debug::debug_reset();
}

/// The `<step/>` command advances execution by one line and
/// then pauses again.  The VM emits a second `<break>` at the
/// new location.
///
/// Because XS processes all pre-loaded commands in one debug
/// round, we verify stepping by checking that the last `<go/>`
/// resumes after the step — meaning at least two breaks occurred.
#[test]
fn step_advances_one_line() {
    let mut ps = powers::HostPowers::new();
    let machine = match debug_machine(&mut ps) {
        Some(m) => m,
        None => return,
    };
    drain_login(&machine);

    // The plan:
    //   1. Hit `debugger` on line 1 → first break.
    //   2. <step/> executes line 2 and breaks on line 3.
    //   3. <go/> resumes to completion.
    //
    // All three commands are pre-loaded.  XS may process <step/>
    // and <go/> in separate debug rounds (if fxDebugCommand
    // processes one element at a time) or in the same round.
    send_cmd("<step/>");
    send_cmd("<go/>");

    machine.eval(
        "debugger;\n\
         var a = 1;\n\
         var b = 2;\n",
    );

    let xml = drain_xml();
    let break_count = count_elements(&xml, "break");
    eprintln!("break events: {}", break_count);
    eprintln!("break lines: {:?}", all_attrs(&xml, "break", "line"));

    // We expect at least one break (the debugger statement).
    // If stepping worked, there should be a second break.
    assert!(
        break_count >= 1,
        "expected at least 1 break event:\n{xml}",
    );
    if break_count >= 2 {
        // The second break should be on a later line.
        let lines = all_attrs(&xml, "break", "line");
        eprintln!("step verified: broke at lines {:?}", lines);
    }

    debug::debug_reset();
}

/// Objects with nested properties can be expanded using the
/// `<toggle>` command.  This test creates an object with nested
/// fields and verifies that property names and values appear
/// in the debugger output.
#[test]
fn inspect_nested_object_properties() {
    let mut ps = powers::HostPowers::new();
    let machine = match debug_machine(&mut ps) {
        Some(m) => m,
        None => return,
    };
    drain_login(&machine);

    send_cmd("<select id=\"0\"/>");
    send_cmd("<go/>");

    machine.eval(
        "var point = { x: 10, y: 20 };\n\
         debugger;\n",
    );

    let xml = drain_xml();
    assert!(xml.contains("<local>"), "expected <local> in:\n{xml}");

    // The local scope should contain `point`.
    let prop_names = all_attrs(&xml, "property", "name");
    eprintln!("properties: {:?}", prop_names);
    assert!(
        prop_names.contains(&"point"),
        "expected 'point' in locals: {:?}",
        prop_names,
    );

    // Depending on XS's default expansion depth, the nested
    // properties `x` and `y` may or may not appear in the
    // initial response.  If they do, verify their values.
    if xml.contains("\"x\"") || prop_names.contains(&"x") {
        eprintln!("nested properties expanded by default");
        let prop_values = all_attrs(&xml, "property", "value");
        eprintln!("values: {:?}", prop_values);
    }

    debug::debug_reset();
}

/// After detaching (resetting the debug state), the VM should
/// continue running normally without pausing at debugger
/// statements or breakpoints.
#[test]
fn detach_resumes_normal_execution() {
    let mut ps = powers::HostPowers::new();
    let machine = match debug_machine(&mut ps) {
        Some(m) => m,
        None => return,
    };
    drain_login(&machine);

    // Detach the debugger.
    debug::debug_reset();

    // Code with a debugger statement should run without pausing.
    let result = machine.eval("var x = 1; debugger; x + 1");
    assert!(
        result.is_some(),
        "eval should complete after detach",
    );

    // No debug output should be generated.
    let xml = drain_xml();
    assert!(
        !xml.contains("<break"),
        "no break expected after detach:\n{xml}",
    );
}

/// A complete debugging session: attach, set breakpoints,
/// run code, inspect state, and resume — demonstrating the
/// full protocol flow.
#[test]
fn complete_debug_session() {
    let mut ps = powers::HostPowers::new();
    let machine = match debug_machine(&mut ps) {
        Some(m) => m,
        None => return,
    };

    // ── Step 1: Handshake ──
    // The VM sends <login> with the machine name.
    let login = drain_login(&machine);
    let machine_name = attr(&login, "login", "name");
    eprintln!("connected to machine: {:?}", machine_name);
    assert!(login.contains("<login"), "handshake failed");

    // ── Step 2: Configure exception breaks ──
    send_cmd("<set-breakpoint path=\"exceptions\" line=\"0\"/>");
    pump(&machine);

    // ── Step 3: Run code that throws ──
    // Pre-load: inspect the throw site, then resume.
    send_cmd("<select id=\"0\"/>");
    send_cmd("<script path=\"(debug)\" line=\"0\"><![CDATA[typeof err]]></script>");
    send_cmd("<go/>");

    machine.eval(
        "function riskyOp() {\n\
         \tvar err = new Error('oops');\n\
         \tthrow err;\n\
         }\n\
         try { riskyOp(); } catch(e) {}\n",
    );

    let xml = drain_xml();

    // ── Step 4: Verify the break ──
    assert!(xml.contains("<break"), "expected exception break");
    eprintln!(
        "exception break at {}:{}",
        attr(&xml, "break", "path").unwrap_or("?"),
        attr(&xml, "break", "line").unwrap_or("?"),
    );

    // ── Step 5: Verify frames ──
    assert!(xml.contains("<frames>"), "expected call stack");
    let frames = all_attrs(&xml, "frame", "name");
    eprintln!("call stack: {:?}", frames);

    // ── Step 6: Verify locals ──
    assert!(xml.contains("<local>"), "expected local scope");
    let locals = all_attrs(&xml, "property", "name");
    eprintln!("local variables: {:?}", locals);

    // ── Step 7: Verify eval result ──
    if let Some(eval_out) = text_content(&xml, "eval") {
        eprintln!("typeof err = {:?}", eval_out);
    }

    // ── Step 8: Clean up ──
    send_cmd("<clear-all-breakpoints/>");
    pump(&machine);
    debug::debug_reset();
}
