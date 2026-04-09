/**
 * Phone-side PebbleKit JS — sends mock data to watch via AppMessage.
 *
 * In a real app, replace the mock data with a fetch() call to an API.
 * The "data" key must match what the watch-side Message subscribes to.
 */

Pebble.addEventListener("ready", function () {
  console.log("Phone JS ready. Sending data in 2 seconds...");

  setTimeout(function () {
    var data = JSON.stringify([
      { title: "Deploy hotfix", priority: "HIGH" },
      { title: "Review PR #42", priority: "MED" },
      { title: "Update docs", priority: "LOW" },
    ]);

    Pebble.sendAppMessage(
      { items: data },
      function () { console.log("Data sent to watch successfully"); },
      function (e) { console.log("Send failed: " + JSON.stringify(e)); }
    );
  }, 2000);
});
