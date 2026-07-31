/**
 * Node test preload — `server-only` throws outside Next RSC; stub it for tsx tests.
 */
const Module = require("module");
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "server-only") {
    return {};
  }
  return originalLoad(request, parent, isMain);
};
