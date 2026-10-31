// Workers' Node compatibility leaves process.umask() unimplemented and a bundled dependency of the
// export libraries calls it when it loads. Answer it with the usual default before anything loads.
try {
  process.umask();
} catch {
  process.umask = () => 0o22;
}
