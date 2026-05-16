// Seccomp-bpf filter for the runtime-agent (DESIGN.md §5.4, §10 M4).
//
// Block-list strategy: deny the documented-dangerous syscalls
// (ptrace, kernel keyring, BPF, perf_event_open, kexec, module
// loading) plus a few others that have no business inside the guest
// agent. Everything else is allowed — this is a defense-in-depth
// layer on top of the unprivileged-uid drop, NOT a tight allow-list.
//
// Enabling: compile with `--features seccomp`. The filter is installed
// once at agent startup, just after the initial Ready is sent on the
// control channel. PR_SET_NO_NEW_PRIVS is set first so the filter
// applies to any future execve as well.
//
// A tight allow-list is roadmap and depends on inventorying what
// `claude -p` actually uses at runtime; over-restricting it would
// kill the agent during normal operation.

#[cfg(feature = "seccomp")]
mod imp {
    use seccompiler::{
        BpfProgram, SeccompAction, SeccompFilter, SeccompRule, TargetArch,
    };
    use std::collections::BTreeMap;

    /// Syscall numbers we explicitly deny. Linux assigns syscall numbers
    /// per arch; we resolve them at compile time via libc constants.
    fn deny_list() -> Vec<i64> {
        vec![
            libc::SYS_ptrace as i64,
            libc::SYS_add_key as i64,
            libc::SYS_request_key as i64,
            libc::SYS_keyctl as i64,
            libc::SYS_bpf as i64,
            libc::SYS_perf_event_open as i64,
            libc::SYS_kexec_load as i64,
            libc::SYS_init_module as i64,
            libc::SYS_finit_module as i64,
            libc::SYS_delete_module as i64,
            libc::SYS_mount as i64,
            libc::SYS_umount2 as i64,
            libc::SYS_pivot_root as i64,
            libc::SYS_swapon as i64,
            libc::SYS_swapoff as i64,
            libc::SYS_reboot as i64,
            libc::SYS_settimeofday as i64,
            libc::SYS_adjtimex as i64,
            libc::SYS_ioperm as i64,
            libc::SYS_iopl as i64,
        ]
    }

    pub fn install() -> Result<(), String> {
        // PR_SET_NO_NEW_PRIVS so the filter survives execve.
        let rc = unsafe { libc::prctl(libc::PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) };
        if rc != 0 {
            return Err(format!("PR_SET_NO_NEW_PRIVS failed: {}", std::io::Error::last_os_error()));
        }

        // The filter: default-allow, deny each entry in deny_list().
        let mut rules: BTreeMap<i64, Vec<SeccompRule>> = BTreeMap::new();
        for sysno in deny_list() {
            rules.insert(sysno, vec![]);
        }
        let filter = SeccompFilter::new(
            rules,
            // Mismatch action: ALLOW (everything not in the deny list).
            SeccompAction::Allow,
            // Match action: KILL_PROCESS for a hard fail.
            SeccompAction::KillProcess,
            #[cfg(target_arch = "x86_64")]
            TargetArch::x86_64,
            #[cfg(target_arch = "aarch64")]
            TargetArch::aarch64,
        )
        .map_err(|e| format!("seccomp filter build: {e}"))?;

        let program: BpfProgram = filter
            .try_into()
            .map_err(|e| format!("seccomp compile: {e}"))?;
        seccompiler::apply_filter(&program)
            .map_err(|e| format!("seccomp apply: {e}"))?;
        Ok(())
    }
}

#[cfg(not(feature = "seccomp"))]
mod imp {
    pub fn install() -> Result<(), String> {
        Ok(())
    }
}

pub use imp::install;
