
import { CALENDAR_CONFIG } from './calendarConfig';

/**
 * Sends a WhatsApp message using the CallMeBot API (Free).
 * 
 * Setup:
 * 1. Add 'phone' and 'apiKey' to CALENDAR_CONFIG (or process.env)
 * 2. Get API Key: Message "I allow callmebot to send me messages" to +34 644 10 55 82
 */
export async function sendWhatsappNotification(message: string) {
    const phone = CALENDAR_CONFIG.whatsappPhone;
    const apiKey = CALENDAR_CONFIG.whatsappApiKey;

    if (!phone || !apiKey) {
        console.warn("WhatsApp notification skipped: Missing phone or apiKey in CALENDAR_CONFIG.");
        return;
    }

    try {
        const encodedMessage = encodeURIComponent(message);
        const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodedMessage}&apikey=${apiKey}`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`CallMeBot API responded with ${response.status}`);
        }

        console.log("WhatsApp notification sent successfully.");
    } catch (error) {
        console.error("Failed to send WhatsApp notification:", error);
    }
}
