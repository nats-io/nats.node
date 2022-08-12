/*
 * Copyright 2018-2022 The NATS Authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
export interface PortInfo {
  clusterName?: string;
  hostname: string;
  port: number;
  cluster?: number;
  monitoring?: number;
  websocket?: number;
}

export interface Ports {
  nats: string[];
  cluster?: string[];
  monitoring?: string[];
  websocket?: string[];
}

export interface NatsServer extends PortInfo {
  restart(): Promise<NatsServer>;
  getLog(): string;
  stop(): Promise<void>;
  signal(s: "KILL" | "QUIT" | "STOP" | "REOPEN" | "RELOAD" | "LDM");
  varz(): Promise<any>;
}
