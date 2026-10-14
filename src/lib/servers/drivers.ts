import { registerDriver, DriverFactory } from "./server-driver";
import { SshDriver } from "./driver-ssh-base";
import { LocalDriver } from "./driver-local";

function register(): void {
  const sshFactory: DriverFactory = (config) => new SshDriver(config);
  registerDriver("ssh", sshFactory);
  // Servidor local (a máquina em que o icewall roda — "Station").
  const localFactory: DriverFactory = (config) => new LocalDriver(config);
  registerDriver("local", localFactory);
}

register();
