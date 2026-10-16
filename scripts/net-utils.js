// Utilitários de rede para descoberta de IPs locais e mDNS
import os from 'os';

/**
 * Obtém a lista de IPs IPv4 locais disponíveis para vinculação e certificados
 * @returns {string[]}
 */
export function getLocalIPs() {
  const nets = os.networkInterfaces();
  const ips = ['localhost', '127.0.0.1', 'vrplayer.local'];
  const localHost = os.hostname();
  if (localHost) {
    ips.push(`${localHost.toLowerCase()}.local`);
    ips.push(localHost);
  }
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
        ips.push(net.address);
      }
    }
  }
  return [...new Set(ips)];
}
