import { setRemoteClientLogFromConfig } from "./app/remoteLog.js";
import { boot } from "./store-app.js";

setRemoteClientLogFromConfig(false);

boot().catch(function (e) {
  console.error("[store_site] boot:", e);
});
