import type { CourseFaq } from "@upscale/shared";
import { textareaValue } from "./rich-editor.ts";

function esc(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function faqCard(item: CourseFaq, index: number) {
  return `<article class="faq-item-card cardish">
    <div class="faq-item-head">
      <h4>Question ${index + 1}</h4>
      <button type="button" class="faq-item-remove">Remove</button>
    </div>
    <div class="form-grid">
      <label class="full">Question<input type="text" class="faq-item-q" value="${esc(item.q)}" maxlength="240" placeholder="e.g. Can beginners join?" /></label>
      <label class="full">Answer<textarea class="faq-item-a" rows="3" maxlength="800" placeholder="Short clear answer for the course page">${esc(item.a)}</textarea></label>
    </div>
  </article>`;
}

export function faqEditorHtml(faqs: CourseFaq[]) {
  const items = faqs.map((f, i) => faqCard(f, i)).join("");
  return `<div class="faq-editor full">
    <div class="faq-editor-head">
      <div>
        <h3>Course questions (FAQ)</h3>
        <p class="note">Shown under “Course questions” on the public course page. Add as many as you need. Leave empty to hide the section.</p>
      </div>
      <button type="button" class="faq-add-item" id="faq-add-item">Add question</button>
    </div>
    <div class="faq-items" id="faq-items">${items}</div>
    <div class="faq-editor-actions">
      <button type="button" class="faq-add-item" id="faq-add-item-bottom">Add another question</button>
    </div>
    <textarea name="faqJson" id="faq-json" hidden aria-hidden="true">${textareaValue(JSON.stringify(faqs, null, 2))}</textarea>
  </div>`;
}

export function faqEditorBoot() {
  return `<script>
    (function () {
      const list = document.getElementById("faq-items");
      const jsonField = document.getElementById("faq-json");
      const form = document.getElementById("course-form");
      if (!list || !jsonField || !form) return;

      function renumber() {
        [...list.querySelectorAll(".faq-item-card")].forEach((card, i) => {
          const title = card.querySelector(".faq-item-head h4");
          if (title) title.textContent = "Question " + (i + 1);
        });
      }

      function readItems() {
        return [...list.querySelectorAll(".faq-item-card")]
          .map((card) => ({
            q: card.querySelector(".faq-item-q")?.value.trim() || "",
            a: card.querySelector(".faq-item-a")?.value.trim() || "",
          }))
          .filter((item) => item.q || item.a);
      }

      function syncJson() {
        jsonField.value = JSON.stringify(readItems(), null, 2);
      }

      function bindCard(card) {
        card.querySelector(".faq-item-remove")?.addEventListener("click", () => {
          card.remove();
          renumber();
          syncJson();
        });
      }

      function addItem() {
        const article = document.createElement("article");
        article.className = "faq-item-card cardish";
        article.innerHTML =
          '<div class="faq-item-head">' +
          "<h4>Question</h4>" +
          '<button type="button" class="faq-item-remove">Remove</button>' +
          "</div>" +
          '<div class="form-grid">' +
          '<label class="full">Question<input type="text" class="faq-item-q" value="" maxlength="240" placeholder="e.g. Can beginners join?" /></label>' +
          '<label class="full">Answer<textarea class="faq-item-a" rows="3" maxlength="800" placeholder="Short clear answer for the course page"></textarea></label>' +
          "</div>";
        list.appendChild(article);
        bindCard(article);
        renumber();
        syncJson();
        article.querySelector(".faq-item-q")?.focus();
      }

      list.querySelectorAll(".faq-item-card").forEach(bindCard);
      document.getElementById("faq-add-item")?.addEventListener("click", addItem);
      document.getElementById("faq-add-item-bottom")?.addEventListener("click", addItem);
      form.addEventListener("submit", syncJson);
      list.addEventListener("input", syncJson);
    })();
  </script>`;
}
