
const now = new Date();
const sixMonthsLater = new Date();
sixMonthsLater.setMonth(now.getMonth() + 6);
const timeMin = now.toISOString();
const timeMax = sixMonthsLater.toISOString();

const eventDate = new Date("2026-03-05T08:00:00"); // Tarih: 5 Mart 2026 (Varsayim: yil 2026)

console.log("--- Time Range Test ---");
console.log("Current Time:", now.toISOString());
console.log("Min Time:", timeMin);
console.log("Max Time:", timeMax);
console.log("Event Date:", eventDate.toISOString());

const isInRange = eventDate >= now && eventDate <= sixMonthsLater;
console.log("Is Event In Range?", isInRange);
