# git checkout clean package.json files in case something goes wrong
# find fixture* -name 'package.json' -exec git checkout -- {} +

find fixture* -name 'package.json' | while read FILE; do
  jq '. + {
    scripts: (
      (.scripts // {}) + {
        preinstall: "echo DO NOT INSTALL TEST FIXTURES; exit -1"
      }
    )
  }' < "$FILE" > "$FILE.neutralized"
  mv "$FILE.neutralized" "$FILE"
done
