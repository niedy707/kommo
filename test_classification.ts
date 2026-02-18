
// @ts-ignore
import { categorizeEvent } from './src/lib/classification.ts';

const titles = [
    "ℹ️ Haftaya 9-13 Yurtdışında olacağım. DİKKATİNİZE.",
    "Normal Ameliyat",
    "Kontrol randevusu"
];

console.log("--- Categorization Test ---");
titles.forEach(t => {
    console.log(`Title: "${t}" => Category: ${categorizeEvent(t)}`);
});
