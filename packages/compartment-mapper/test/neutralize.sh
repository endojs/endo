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
