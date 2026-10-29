// STUN Binding over TCP: proves whether a TCP port reaches coturn (local control test).
import net from "node:net";
import crypto from "node:crypto";
const [host, portArg] = process.argv.slice(2);
const packet = Buffer.alloc(20);
packet.writeUInt16BE(0x0001, 0); packet.writeUInt16BE(0, 2); packet.writeUInt32BE(0x2112a442, 4); crypto.randomBytes(12).copy(packet, 8);
const socket = net.connect(Number(portArg), host, () => socket.write(packet));
const timer = setTimeout(() => { console.log(`${host}:${portArg} tcp no reply`); socket.destroy(); process.exit(1); }, 6000);
socket.on("data", (data) => { clearTimeout(timer); console.log(`${host}:${portArg} tcp REPLY type=0x${data.readUInt16BE(0).toString(16)} bytes=${data.length}`); socket.end(); process.exit(0); });
socket.on("error", (error) => { clearTimeout(timer); console.log(`${host}:${portArg} tcp error ${error.message}`); process.exit(1); });
