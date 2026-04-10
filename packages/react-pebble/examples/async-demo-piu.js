/**
 * Proof-of-concept: runtime data loading via phone→watch messaging.
 *
 * 1. Watch starts showing "Loading..."
 * 2. Phone-side JS (pkjs/index.js) sends mock data after 2 seconds
 * 3. Watch receives data via Message.onReadable, parses JSON, updates labels
 *
 * Hand-written (not compiler-generated) to prove the message pipeline.
 */

import {} from "piu/MC";
import Message from "pebble/message";

const blackSkin = new Skin({ fill: "black" });
const darkSkin = new Skin({ fill: "#333333" });
const headerSkin = new Skin({ fill: "white" });
const titleStyle = new Style({ font: "bold 18px Gothic", color: "black" });
const labelStyle = new Style({ font: "bold 18px Gothic", color: "white" });
const subStyle = new Style({ font: "14px Gothic", color: "#c0c0c0" });
const loadingStyle = new Style({ font: "24px Gothic", color: "#c0c0c0" });

class AsyncBehavior extends Behavior {
  onCreate(app) {
    this.loading = app.first.content("loading");
    this.list = app.first.content("list");
    this.items = [];
    for (let i = 0; i < 3; i++) {
      const g = this.list.content("item" + i);
      this.items.push({
        title: g.content("t" + i),
        sub: g.content("s" + i),
      });
    }

    // Subscribe to messages from phone
    console.log("Subscribing to messages...");
    this.msg = new Message({
      keys: ["data"],
      onReadable() {
        console.log("Message received!");
        const map = this.read();
        const json = map.get("data");
        if (json) {
          try {
            const data = JSON.parse(json);
            console.log("Parsed " + data.length + " items");
            // Update from the behavior context — `this` in onReadable is the Message,
            // so we stashed the behavior reference.
            this.behavior.updateData(data);
          } catch (e) {
            console.log("Parse error: " + e.message);
          }
        }
      }
    });
    // Stash behavior reference so onReadable can call back
    this.msg.behavior = this;
  }

  onDisplaying(app) {
    // Show loading state
    this.loading.visible = true;
    this.list.visible = false;
  }

  updateData(data) {
    console.log("Updating UI with " + data.length + " items");
    this.loading.visible = false;
    this.list.visible = true;
    for (let i = 0; i < 3; i++) {
      const item = data[i];
      if (item) {
        this.items[i].title.string = item.title || "";
        this.items[i].sub.string = item.priority || "";
      }
    }
  }
}

const App = Application.template(() => ({
  skin: blackSkin,
  Behavior: AsyncBehavior,
  contents: [
    new Container(null, { left: 0, right: 0, top: 0, bottom: 0, contents: [
      // Header
      new Content(null, { left: 0, top: 0, width: 200, height: 28, skin: headerSkin }),
      new Label(null, { top: 4, left: 4, style: titleStyle, string: "Async Demo" }),

      // Loading state
      new Container(null, { name: "loading", left: 0, right: 0, top: 28, bottom: 0, visible: true, contents: [
        new Label(null, { top: 80, left: 0, right: 0, style: loadingStyle, horizontal: "center", string: "Loading..." }),
      ] }),

      // Data list (initially hidden)
      new Container(null, { name: "list", left: 0, right: 0, top: 28, bottom: 0, visible: false, contents: [
        new Container(null, { name: "item0", left: 0, top: 4, right: 0, height: 55, skin: darkSkin, contents: [
          new Label(null, { name: "t0", top: 4, left: 8, style: labelStyle, string: "" }),
          new Label(null, { name: "s0", top: 28, left: 8, style: subStyle, string: "" }),
        ] }),
        new Container(null, { name: "item1", left: 0, top: 62, right: 0, height: 55, contents: [
          new Label(null, { name: "t1", top: 4, left: 8, style: labelStyle, string: "" }),
          new Label(null, { name: "s1", top: 28, left: 8, style: subStyle, string: "" }),
        ] }),
        new Container(null, { name: "item2", left: 0, top: 120, right: 0, height: 55, contents: [
          new Label(null, { name: "t2", top: 4, left: 8, style: labelStyle, string: "" }),
          new Label(null, { name: "s2", top: 28, left: 8, style: subStyle, string: "" }),
        ] }),
      ] }),
    ] }),
  ],
}));

export default new App(null, { touchCount: 0, pixels: screen.width * 4 });
