// Temporary. Issue #149.
if (process.send) process.send({ ready: true, pid: process.pid });
setTimeout(() => process.exit(0), 5000);
