# Unity WebGL interviewer avatar — integration guide

Embed a realistic 3D interviewer built in **Unity** and exported to **WebGL**. No Unreal, no
GPU server, no video streaming — the avatar runs in the browser like any web app. The Epsilon
Speak Pro web app embeds your Unity build in an `<iframe>` and drives speech over a small
`postMessage` bridge.

**Priority in the app:** Pixel Streaming (MetaHuman) → **Unity WebGL** → three.js 3D → 2D.
Set the URL in **Admin → AI & Avatar → Unity WebGL URL** (point it at your build's `index.html`).

---

## What goes in the Unity project

1. **A character** — e.g. a Ready Player Me / Mixamo / Character Creator model, or any rigged
   head with blendshapes.
2. **Lip-sync**, pick one:
   - **uLipSync** (free, open source) — analyses an AudioClip in real time → viseme blendshapes.
   - **SALSA LipSync Suite** (paid) — robust, audio-driven.
   - **Audio2Face frames** — apply ARKit blendshape weights you receive from the backend `/a2f`.
3. **A web bridge** (below) so the page can tell the avatar what to say.
4. Build: **File → Build Settings → WebGL → Build**, then host the output folder and paste its
   `index.html` URL into the app.

---

## The bridge contract (postMessage)

**Page → Unity** (the app sends JSON strings):
```jsonc
{ "type": "speak",     "text": "Tell me about a skill you'd like to learn." }
{ "type": "stopSpeak" }                       // sent when the spoken line finishes
// (optional high-fidelity mode) the app can also send audio for in-Unity lip-sync:
{ "type": "speakAudio", "audio_b64": "...wav...", "fps": 30, "names": ["jawOpen", ...],
  "frames": [[0.1, ...], ...] }
```

**Unity → Page** (optional):
```jsonc
{ "type": "unityReady" }      // tells the app the avatar is loaded
{ "type": "spoken" }          // tells the app the avatar finished (optional; the app also
                              //   advances when its own audio playback ends)
```

> **Default mode:** the **app plays the speech audio** (browser TTS or backend `/tts`) and sends
> `speak`/`stopSpeak` so Unity just animates the mouth for the duration — simplest and always in
> sync with the audio the student hears. For phoneme-accurate lips, switch to `speakAudio`: mute
> the app's audio, send the wav to Unity, and let uLipSync analyse it (or apply the `frames`).

---

## Unity side — receive page messages

WebGL can't directly read browser `postMessage`, so add a tiny JS plugin that forwards messages
into Unity via `SendMessage`.

`Assets/Plugins/WebBridge.jslib`
```javascript
mergeInto(LibraryManager.library, {
  ESP_Init: function () {
    window.addEventListener('message', function (e) {
      var msg = typeof e.data === 'string' ? e.data : JSON.stringify(e.data);
      // "WebBridge" must match the GameObject name; "OnWebMessage" the C# method.
      if (window.unityInstance) window.unityInstance.SendMessage('WebBridge', 'OnWebMessage', msg);
    });
    // let the page know we're ready
    parent.postMessage(JSON.stringify({ type: 'unityReady' }), '*');
  },
  ESP_Spoken: function () { parent.postMessage(JSON.stringify({ type: 'spoken' }), '*'); }
});
```

> In your WebGL template, capture the loader's instance as `window.unityInstance = unityInstance;`
> inside the `createUnityInstance(...).then(function (unityInstance) { ... })` callback.

`Assets/Scripts/WebBridge.cs`
```csharp
using System.Runtime.InteropServices;
using UnityEngine;

public class WebBridge : MonoBehaviour
{
    [DllImport("__Internal")] private static extern void ESP_Init();
    [DllImport("__Internal")] private static extern void ESP_Spoken();

    public Avatar avatarController;          // your component that drives mouth/lip-sync

    void Start()
    {
#if !UNITY_EDITOR && UNITY_WEBGL
        ESP_Init();
#endif
    }

    // Called from JS with the JSON string the page posted.
    public void OnWebMessage(string json)
    {
        var msg = JsonUtility.FromJson<Msg>(json);
        switch (msg.type)
        {
            case "speak":     avatarController.StartTalking(msg.text); break;   // begin mouth motion
            case "stopSpeak": avatarController.StopTalking();          break;   // idle
            case "speakAudio":avatarController.SpeakAudio(msg.audio_b64, msg.fps, msg.names, msg.frames); break;
        }
    }

    [System.Serializable] public class Msg {
        public string type;
        public string text;
        public string audio_b64;
        public int fps;
        public string[] names;
        public float[][] frames;   // for nested arrays, parse with a JSON lib that supports them
    }
}
```

`avatarController` is your own script:
- **`StartTalking`/`StopTalking`** — drive a simple jaw/viseme flap while the page's audio plays.
- **`SpeakAudio`** — decode the wav into an `AudioClip`, play it, and run uLipSync on it (or apply
  the `frames` as blendshape weights at `i/fps`). Call `ESP_Spoken()` when the clip ends.

---

## Hosting & connecting

1. Build to WebGL and host the output (any static host / your own server). HTTPS recommended.
2. In **Epsilon Speak Pro → Admin → AI & Avatar**, paste the build's `index.html` URL into
   **Unity WebGL URL** and Save.
3. Start a test — the interview screen embeds the Unity avatar, which talks in time with the
   interviewer's speech. If the URL is blank, the app falls back to the three.js 3D avatar, then
   the 2D presenter.

## Notes

- **Mic stays in the page.** The student's microphone capture, transcription, and IELTS scoring
  all happen in the web app / backend; Unity only renders and lip-syncs the interviewer.
- **CORS/embedding:** serve the Unity build with headers that allow being framed by your app's
  origin. WebGL audio needs a user gesture — the "Start test" click covers this.
- **Performance:** keep the scene light (one character, simple lighting) so the WebGL build loads
  fast and runs on student laptops.
