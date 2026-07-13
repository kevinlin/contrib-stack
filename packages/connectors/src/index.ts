export const VERSION = "0.0.1";

export {
  type ConnectorCreds,
  type AccountInfo,
  type DayCount,
  type Connector,
  ConnectorAuthError,
} from "./types";

export { githubConnector } from "./github";
export { makeGitlabConnector } from "./gitlab";
export { SsrfError, ResponseTooLargeError, validateUrl } from "./safe-fetch";
