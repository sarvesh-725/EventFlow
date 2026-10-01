import { createApp } from "./app.js";
import { assertProductionConfiguration, env } from "./config/env.js";

assertProductionConfiguration();
const app = createApp();

app.listen(env.PORT, () => {
  console.log(`EventFlow API listening on port ${env.PORT}`);
});
