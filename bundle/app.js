// Minimal Anna App bundle entry. Replace with real logic.
import { AnnaAppRuntime } from "/static/anna-apps/_sdk/latest/index.js";

const TOOL_ID = "paper-core";

async function main() {
  const status = document.getElementById("status");
  const btn = document.getElementById("primary-btn");
  if (!status || !btn) return;

  let anna;
  try {
    anna = await AnnaAppRuntime.connect();
  } catch (e) {
    status.textContent = "Standalone preview (no host).";
    return;
  }

  await anna.window.set_title({ title: "scholaros" });
  status.textContent = "Ready.";

  btn.addEventListener("click", async () => {
    status.textContent = "Running...";
    try {
      const out = await anna.tools.invoke({
        tool_id: TOOL_ID,
        method: "compliance",
        args: { text: "Figure 1 shows 10mAh capacity. As shown in [3]." },
      });
      await anna.storage.set({ key: "scholaros:last", value: Date.now() });
      status.textContent = JSON.stringify(out, null, 2);
    } catch (e) {
      status.textContent = "Error: " + e.message;
    }
  });
}

main();
