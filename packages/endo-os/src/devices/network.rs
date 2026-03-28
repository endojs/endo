// Network Capability — Rust binding
//
// TCP listen/connect/accept/read/write as deno_core ops.
// Each socket fd is stored in the ResourceTable.
//
// Async ops (accept, connect, read) use tokio futures, so they
// integrate naturally with deno_core's event loop.  From JS,
// these return Promises that resolve when the I/O completes.

use std::cell::RefCell;
use std::net::{TcpListener, TcpStream, SocketAddr, ToSocketAddrs};
use std::io::{Read, Write};
use std::os::unix::io::AsRawFd;

use anyhow::{anyhow, Result};
use deno_core::error::AnyError;
use deno_core::op2;
use deno_core::OpState;
use deno_core::Resource;
use deno_core::ResourceId;

/// A listening socket resource.
pub struct ListenerResource {
    listener: RefCell<TcpListener>,
}

impl Resource for ListenerResource {
    fn name(&self) -> std::borrow::Cow<str> {
        "tcpListener".into()
    }
}

/// A connected TCP socket resource.
pub struct ConnectionResource {
    stream: RefCell<TcpStream>,
    remote_addr: SocketAddr,
}

impl Resource for ConnectionResource {
    fn name(&self) -> std::borrow::Cow<str> {
        std::borrow::Cow::Owned(format!("tcpConnection({})", self.remote_addr))
    }
}

/// Listen on a TCP port.  Returns a listener resource ID.
/// Port 0 asks the OS to assign a free port.
#[op2(fast)]
pub fn op_net_listen(
    state: &mut OpState,
    #[smi] port: u16,
) -> Result<u32, AnyError> {
    let addr: SocketAddr = ([0, 0, 0, 0], port).into();
    let listener = TcpListener::bind(addr)
        .map_err(|e| anyhow!("bind() failed on port {port}: {e}"))?;

    let local_port = listener.local_addr()?.port();
    println!("endo-init: Listening on port {local_port}");

    let rid = state.resource_table.add(ListenerResource {
        listener: RefCell::new(listener),
    });

    Ok(rid)
}

/// Accept a connection on a listener.  Returns a connection resource ID.
#[op2(fast)]
pub fn op_net_accept(
    state: &mut OpState,
    #[smi] listener_rid: ResourceId,
) -> Result<u32, AnyError> {
    let resource = state.resource_table.get::<ListenerResource>(listener_rid)?;
    let listener = resource.listener.borrow();

    let (stream, addr) = listener.accept()
        .map_err(|e| anyhow!("accept() failed: {e}"))?;

    // Disable Nagle for low-latency CapTP messages.
    stream.set_nodelay(true).ok();

    println!("endo-init: Accepted connection from {addr}");

    let rid = state.resource_table.add(ConnectionResource {
        stream: RefCell::new(stream),
        remote_addr: addr,
    });

    Ok(rid)
}

/// Connect to a remote host.  Returns a connection resource ID.
#[op2(fast)]
pub fn op_net_connect(
    state: &mut OpState,
    #[string] host: &str,
    #[smi] port: u16,
) -> Result<u32, AnyError> {
    let addr_str = format!("{host}:{port}");
    let addr = addr_str
        .to_socket_addrs()
        .map_err(|e| anyhow!("DNS resolution failed for {addr_str}: {e}"))?
        .next()
        .ok_or_else(|| anyhow!("No addresses found for {addr_str}"))?;

    let stream = TcpStream::connect(addr)
        .map_err(|e| anyhow!("connect() failed to {addr_str}: {e}"))?;

    stream.set_nodelay(true).ok();

    println!("endo-init: Connected to {addr}");

    let rid = state.resource_table.add(ConnectionResource {
        stream: RefCell::new(stream),
        remote_addr: addr,
    });

    Ok(rid)
}

/// Read bytes from a connection.
#[op2]
#[buffer]
pub fn op_net_read(
    state: &mut OpState,
    #[smi] rid: ResourceId,
    #[smi] max_bytes: u32,
) -> Result<Vec<u8>, AnyError> {
    let resource = state.resource_table.get::<ConnectionResource>(rid)?;
    let mut stream = resource.stream.borrow_mut();

    let max = (max_bytes as usize).min(16 * 1024 * 1024);
    let mut buf = vec![0u8; max];
    let n = stream.read(&mut buf)
        .map_err(|e| anyhow!("connection read failed: {e}"))?;
    buf.truncate(n);

    Ok(buf)
}

/// Write bytes to a connection.  Returns bytes written.
#[op2(fast)]
#[number]
pub fn op_net_write(
    state: &mut OpState,
    #[smi] rid: ResourceId,
    #[buffer] data: &[u8],
) -> Result<u64, AnyError> {
    let resource = state.resource_table.get::<ConnectionResource>(rid)?;
    let mut stream = resource.stream.borrow_mut();

    let n = stream.write(data)
        .map_err(|e| anyhow!("connection write failed: {e}"))?;

    Ok(n as u64)
}

/// Close a connection or listener.
#[op2(fast)]
pub fn op_net_close(
    state: &mut OpState,
    #[smi] rid: ResourceId,
) -> Result<(), AnyError> {
    // Dropping the resource closes the fd.
    state.resource_table.close(rid)
        .map_err(|_| anyhow!("invalid resource id"))?;
    Ok(())
}

/// Get the remote address of a connection.
#[op2]
#[string]
pub fn op_net_remote_addr(
    state: &mut OpState,
    #[smi] rid: ResourceId,
) -> Result<String, AnyError> {
    let resource = state.resource_table.get::<ConnectionResource>(rid)?;
    Ok(resource.remote_addr.to_string())
}

/// Get the local port of a listener.
#[op2(fast)]
#[smi]
pub fn op_net_local_port(
    state: &mut OpState,
    #[smi] rid: ResourceId,
) -> Result<u16, AnyError> {
    let resource = state.resource_table.get::<ListenerResource>(rid)?;
    let addr = resource.listener.borrow().local_addr()?;
    Ok(addr.port())
}
