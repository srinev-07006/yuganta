#!/usr/bin/env bash
# Converts CharacterPotraits/*.png (source art) -> public/portraits/<character_id>[_EMOTION].webp (what the game loads).
# Re-run whenever the source art changes. Needs ImageMagick (`convert`).
set -e
cd "$(dirname "$0")/.."; mkdir -p public/portraits
map() { # source-name  dest-name
  [ -f "CharacterPotraits/portrait_$1.png" ] || { echo "missing source: $1"; return; }
  convert "CharacterPotraits/portrait_$1.png" -resize 420x420 -quality 86 "public/portraits/$2.webp"; }
map abhimanyu_standing abhimanyu; map arjuna arjuna; map ashwatthama ashwatthama; map bhima_standing bhima
map bhisma_standing bhishma; map dhrishtadyumna dhrishtadyumna; map dhritarashtra dhritarashtra; map draupadi draupadi
map drona drona; map drupada drupada; map duhshasana duhshasana; map duryodhana duryodhana; map gandhari_young gandhari
map ghatotkacha ghatotkacha; map jayadratha jayadratha; map karna karna; map kripacharya kripacharya
map krishna_standing krishna; map krishna_angry krishna_ANGRY; map kuntiold kunti; map kuntiyoung kunti_young
map nakula nakula; map sahadeva1 sahadeva; map sanjaya sanjaya; map satyaki satyaki; map shakuni shakuni; map shalya shalya
map sikhandi shikhandi; map uttara uttara; map vidura vidura; map virata virata; map vyasa vyasa; map yudhisthira yudhishthira
echo "portraits: $(ls public/portraits | wc -l) files, $(du -sh public/portraits | cut -f1)"
