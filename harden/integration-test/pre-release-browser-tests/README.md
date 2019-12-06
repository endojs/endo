## Testing locally

To test locally without a server, you can drag and drop the index.html in each of these folders into Google Chrome. Look for something like

```
1..42
# tests 42
# pass  42

# ok
```

in the console log. 

Parcel is a special case. Because Parcel rewrites the index.html file as well as the JavaScript files, the index.html file to test for Parcel is under `bundles/parcel/`
