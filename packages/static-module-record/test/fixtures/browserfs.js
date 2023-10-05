
// src/ApiError.ts
var ErrorCode = /* @__PURE__ */ ((ErrorCode2) => {
  ErrorCode2[ErrorCode2["EPERM"] = 1] = "EPERM";
  ErrorCode2[ErrorCode2["ENOENT"] = 2] = "ENOENT";
  ErrorCode2[ErrorCode2["EIO"] = 5] = "EIO";
  ErrorCode2[ErrorCode2["EBADF"] = 9] = "EBADF";
  ErrorCode2[ErrorCode2["EACCES"] = 13] = "EACCES";
  ErrorCode2[ErrorCode2["EBUSY"] = 16] = "EBUSY";
  ErrorCode2[ErrorCode2["EEXIST"] = 17] = "EEXIST";
  ErrorCode2[ErrorCode2["ENOTDIR"] = 20] = "ENOTDIR";
  ErrorCode2[ErrorCode2["EISDIR"] = 21] = "EISDIR";
  ErrorCode2[ErrorCode2["EINVAL"] = 22] = "EINVAL";
  ErrorCode2[ErrorCode2["EFBIG"] = 27] = "EFBIG";
  ErrorCode2[ErrorCode2["ENOSPC"] = 28] = "ENOSPC";
  ErrorCode2[ErrorCode2["EROFS"] = 30] = "EROFS";
  ErrorCode2[ErrorCode2["ENOTEMPTY"] = 39] = "ENOTEMPTY";
  ErrorCode2[ErrorCode2["ENOTSUP"] = 95] = "ENOTSUP";
  return ErrorCode2;
})(ErrorCode || {});

ErrorCode[1];

export {
  ErrorCode
}