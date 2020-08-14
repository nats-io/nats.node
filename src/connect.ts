import { NodeTransport } from "./node_transport";
import {
  NatsConnection,
  ConnectionOptions,
  setTransportFactory,
  Transport,
  NatsConnectionImpl,
} from "./nats-base-client";

export function connect(opts: ConnectionOptions = {}): Promise<NatsConnection> {
  setTransportFactory((): Transport => {
    return new NodeTransport();
  });

  return NatsConnectionImpl.connect(opts);
}
