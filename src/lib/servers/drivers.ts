import { registerDriver, DriverFactory } from "./server-driver";
import { SshDriver } from "./driver-ssh-base";

function register(): void {
  const factory: DriverFactory = (config) => new SshDriver(config);
  registerDriver("ssh", factory);
}

register();
