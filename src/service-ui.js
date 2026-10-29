import { SERVICE_OPENING,serviceCounts } from "./service-dialogue.js";
import { normalizeLocale } from "./guest.js";

// A reviewable text exchange; it never scores or silently commits hotel actions.
export function renderServiceChat(events,channel,locale,safe,finished=false,busy=false) {
  const lang=normalizeLocale(locale);
  const name=channel==="arrival"?"Sofia Demir":"Housekeeping";
  const rows=events.filter(e=>["service_message","service_reply"].includes(e.type) && e.payload?.channel===channel);
  const counts=serviceCounts(events,channel);
  const disabled=finished||counts.pending||counts.questions>=6||busy;
  const field="service-chat-"+channel;
  const options=[["de","Deutsch"],["tr","Türkçe"],["en","English"]].map(([id,label])=>`<option value="${id}" ${lang===id?"selected":""}>${label}</option>`).join("");
  return `<section class="fd-service-chat" aria-label="${name} Gespräch">
    <header class="fd-service-chat-top"><div><span class="fd-service-chat-dot"></span><b>${name}</b><small>LIVE ROLEPLAY · ${counts.questions}/6</small></div>
      <select id="service-locale" aria-label="Gesprächssprache">${options}</select></header>
    <div class="fd-service-messages" role="log" aria-label="${name} Gesprächsverlauf" aria-live="polite">
      ${[{actor:"service",payload:{text:SERVICE_OPENING[channel][lang],source:"scripted"}},...rows].map(e=>{
        const service=e.actor==="service";
        return `<div class="fd-service-bubble ${service?"from-service":"from-candidate"}"><small>${service?name:"SIE"}${service?" · "+(e.payload.source==="ai"?"AI":"REGELBASIERT"):""}</small><p>${safe(e.payload?.text)}</p></div>`;
      }).join("")}
      ${counts.pending?`<div class="fd-service-bubble from-service"><small>${name}</small><p>Antwort wird vorbereitet …</p></div>`:""}
    </div>
    <div class="fd-service-compose"><label for="${field}">Was sagen Sie ${channel==="phone"?"am Telefon":"zum Gast"}?</label>
      <textarea id="${field}" rows="3" maxlength="500" placeholder="${channel==="arrival"?"Guten Tag Frau Demir, ich prüfe Ihre Reservierung ...":"Guten Morgen, können Sie den aktuellen Zimmerstatus bestätigen?"}" ${disabled?"disabled":""}></textarea>
      <div class="fd-service-send"><span>Frei formulieren · keine automatische Eignungsbewertung</span>
        <button class="secondary" data-action="service-chat" data-channel="${channel}" ${disabled?"disabled":""}>Antwort senden →</button></div>
    </div>
  </section>`;
}