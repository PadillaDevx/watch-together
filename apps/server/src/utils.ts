import os from 'os';

export function getLocalIP(): string {
  for (const ifaceList of Object.values(os.networkInterfaces())) {
    if (!ifaceList) continue;
    for (const iface of ifaceList) {
      if (!iface.internal && iface.family === 'IPv4') return iface.address;
    }
  }
  return 'localhost';
}
