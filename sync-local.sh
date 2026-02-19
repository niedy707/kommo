#!/bin/bash
# Kommo Sync - Local Runner
# GitHub Actions'daki cron işini localhost'ta simüle eder (her 15 dakikada bir)

URL="http://localhost:3000/api/calendar/sync?trigger=auto"
INTERVAL=900  # 15 dakika = 900 saniye

echo "🔄 Kommo Sync başlatıldı - Her 15 dakikada bir çalışacak"
echo "   Endpoint: $URL"
echo "   Durdurmak için: Ctrl+C"
echo "-------------------------------------------"

while true; do
  echo ""
  echo "⏰ $(date '+%H:%M:%S') - Sync başlıyor..."
  RESPONSE=$(curl -s -X POST "$URL" \
    -H "Content-Type: application/json" \
    -w "\n%{http_code}")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -1)

  if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Sync başarılı (HTTP $HTTP_CODE)"
    echo "$BODY" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    s = d.get('stats', {})
    print(f\"   ➕ Yeni: {s.get('created',0)}  ♻️  Güncellendi: {s.get('updated',0)}  🗑️  Silindi: {s.get('deleted',0)}\")
except:
    pass
" 2>/dev/null
  else
    echo "❌ Sync başarısız (HTTP $HTTP_CODE)"
    echo "   $BODY"
  fi

  echo "⏳ Bir sonraki sync: $(date -d "+${INTERVAL} seconds" '+%H:%M:%S' 2>/dev/null || date -v +${INTERVAL}S '+%H:%M:%S') de..."
  sleep $INTERVAL
done
