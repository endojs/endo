use std::time::{Instant, SystemTime};

use tokio::sync::oneshot;

pub type Handle = i64;

// ---------------------------------------------------------------------------
// Metering types
// ---------------------------------------------------------------------------

/// Metering mode for a worker.
#[derive(Clone, Debug, PartialEq)]
pub enum MeterMode {
    /// Steps counted but no enforcement (default).
    Measurement,
    /// Fixed budget; messages gated on budget >= hard_limit.
    Quota,
    /// Budget accumulates over time at a configured rate.
    RateLimited,
}

/// Rate-limit configuration for a worker.
#[derive(Clone, Debug)]
pub struct RateLimit {
    /// Computrons added per second.
    pub rate: u64,
    /// Maximum budget that can accumulate (burst ceiling).
    pub burst: u64,
    /// Timestamp of last refill calculation.
    pub last_refill: Instant,
}

/// Per-worker metering state.
#[derive(Clone, Debug)]
pub struct MeterState {
    pub mode: MeterMode,
    /// Total computrons consumed across all cranks (lifetime).
    pub accumulated: u64,
    /// Current step budget (decremented per crank).
    pub budget: u64,
    /// Maximum steps allowed in a single crank.
    pub hard_limit: u64,
    /// Rate-limit configuration (only for RateLimited mode).
    pub rate_limit: Option<RateLimit>,
}

impl Default for MeterState {
    fn default() -> Self {
        MeterState {
            mode: MeterMode::Measurement,
            accumulated: 0,
            budget: 0,
            hard_limit: 0,
            rate_limit: None,
        }
    }
}

impl MeterState {
    /// Lazy rate-limit refill: compute earned budget based on
    /// elapsed time since last refill.
    pub fn refill(&mut self) {
        if let Some(ref mut rl) = self.rate_limit {
            let now = Instant::now();
            let elapsed = now.duration_since(rl.last_refill);
            let earned = (elapsed.as_secs_f64() * rl.rate as f64) as u64;
            if earned > 0 {
                self.budget = (self.budget + earned).min(rl.burst);
                rl.last_refill = now;
            }
        }
    }

    /// Whether this worker should accept a message.
    pub fn should_deliver(&mut self) -> bool {
        match self.mode {
            MeterMode::Measurement => true,
            MeterMode::Quota | MeterMode::RateLimited => {
                self.refill();
                self.budget >= self.hard_limit
            }
        }
    }

    /// Earliest time at which the worker will accept a message.
    /// Returns `None` if ready now or never (quota mode with
    /// insufficient budget).
    pub fn ready_time(&self) -> Option<Instant> {
        match self.mode {
            MeterMode::Measurement => None,
            MeterMode::Quota => None,
            MeterMode::RateLimited => {
                if self.budget >= self.hard_limit {
                    return None; // ready now
                }
                let deficit = self.hard_limit - self.budget;
                let rl = self.rate_limit.as_ref()?;
                if rl.rate == 0 {
                    return None; // never
                }
                let seconds = deficit as f64 / rl.rate as f64;
                Some(rl.last_refill + std::time::Duration::from_secs_f64(seconds))
            }
        }
    }
}

pub struct Envelope {
    pub handle: Handle,
    pub verb: String,
    pub payload: Vec<u8>,
    pub nonce: i64,
}

pub struct Message {
    pub from: Handle,
    pub to: Handle,
    pub envelope: Envelope,
    pub response_tx: Option<oneshot::Sender<Envelope>>,
}

#[derive(Clone)]
pub struct WorkerInfo {
    pub handle: Handle,
    pub platform: String,
    pub cmd: String,
    pub args: Vec<String>,
    pub pid: u32,
    pub started: SystemTime,
}
