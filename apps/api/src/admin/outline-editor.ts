import type { WeekBlock } from "@upscale/shared";
import { textareaValue } from "./rich-editor.ts";

function esc(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function weekCard(week: WeekBlock) {
  const hours = week.hours > 0 ? String(week.hours) : "";
  return `<article class="outline-week cardish">
    <div class="outline-week-head">
      <h4>Week <input type="number" class="outline-week-num" min="1" value="${week.week}" /></h4>
      <button type="button" class="outline-week-remove ghost">Remove</button>
    </div>
    <div class="form-grid">
      <label class="full">Title<input type="text" class="outline-week-title" value="${esc(week.title)}" maxlength="200" placeholder="Optional" /></label>
      <label>Hours<input type="number" class="outline-week-hours" min="1" max="80" value="${hours}" placeholder="Optional" /></label>
      <label class="full">Topics (one per line)<textarea class="outline-week-topics" rows="4" placeholder="Optional">${esc(week.topics.join("\n"))}</textarea></label>
      <label class="full">Learner's assessment<textarea class="outline-week-project" rows="2" placeholder="Leave blank if none for this week">${week.project ? esc(week.project) : ""}</textarea></label>
    </div>
  </article>`;
}

export function outlineEditorHtml(outline: WeekBlock[]) {
  const weeks = outline.map((w) => weekCard(w)).join("");
  return `<div class="outline-editor full">
    <div class="outline-editor-head">
      <div>
        <h3>Course outline</h3>
        <p class="note">Every field is optional. Leave a week blank if you do not want it on the public page, or remove the week entirely.</p>
      </div>
      <button type="button" class="ghost" id="outline-add-week">Add week</button>
    </div>
    <div class="outline-weeks" id="outline-weeks">${weeks}</div>
    <textarea name="outlineJson" id="outline-json" hidden aria-hidden="true">${textareaValue(JSON.stringify(outline, null, 2))}</textarea>
  </div>`;
}

export function outlineEditorBoot() {
  return `<script>
    (function () {
      const list = document.getElementById("outline-weeks");
      const jsonField = document.getElementById("outline-json");
      const form = document.getElementById("course-form");
      if (!list || !jsonField || !form) return;

      function readWeeks() {
        return [...list.querySelectorAll(".outline-week")].map((card) => {
          const project = card.querySelector(".outline-week-project")?.value.trim() || "";
          return {
            week: Number(card.querySelector(".outline-week-num")?.value || 0),
            title: card.querySelector(".outline-week-title")?.value.trim() || "",
            hours: Number(card.querySelector(".outline-week-hours")?.value || 0),
            topics: (card.querySelector(".outline-week-topics")?.value || "")
              .split("\\n")
              .map((line) => line.trim())
              .filter(Boolean),
            project: project || null,
          };
        });
      }

      function syncJson() {
        jsonField.value = JSON.stringify(readWeeks(), null, 2);
      }

      function nextWeekNumber() {
        const nums = readWeeks().map((w) => w.week).filter((n) => n > 0);
        return nums.length ? Math.max(...nums) + 1 : 1;
      }

      function bindCard(card) {
        card.querySelector(".outline-week-remove")?.addEventListener("click", () => {
          card.remove();
          syncJson();
        });
      }

      function addWeek(weekNum) {
        const article = document.createElement("article");
        article.className = "outline-week cardish";
        article.innerHTML =
          '<div class="outline-week-head">' +
          '<h4>Week <input type="number" class="outline-week-num" min="1" value="' + weekNum + '" /></h4>' +
          '<button type="button" class="outline-week-remove ghost">Remove</button>' +
          "</div>" +
          '<div class="form-grid">' +
          '<label class="full">Title<input type="text" class="outline-week-title" value="" maxlength="200" placeholder="Optional" /></label>' +
          '<label>Hours<input type="number" class="outline-week-hours" min="1" max="80" value="" placeholder="Optional" /></label>' +
          '<label class="full">Topics (one per line)<textarea class="outline-week-topics" rows="4" placeholder="Optional"></textarea></label>' +
          '<label class="full">Learner\\'s assessment<textarea class="outline-week-project" rows="2" placeholder="Leave blank if none for this week"></textarea></label>' +
          "</div>";
        list.appendChild(article);
        bindCard(article);
        syncJson();
      }

      list.querySelectorAll(".outline-week").forEach(bindCard);
      document.getElementById("outline-add-week")?.addEventListener("click", () => addWeek(nextWeekNumber()));
      form.addEventListener("submit", syncJson);
      list.addEventListener("input", syncJson);
    })();
  </script>`;
}
