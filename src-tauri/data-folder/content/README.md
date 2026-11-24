# content

Your own content that deploy modules copy into the site.

| File | Written by | Used by |
| --- | --- | --- |
| `content-replacement.json` | Replace Content, when you Save. It keeps the previous save as `content-replacement.json.bak`. | The Content replacement module, which copies it to the site's `data/content-replacement.json`. |
| `item-prices.json` | Shops → Prices, when you Save. It keeps the previous save as `item-prices.json.bak`. | The Item prices module, which writes the prices into the site's item data in Prepare and into homebrew copies on deploy. |
| `shops/*.json` | Shops → Lists, and the Site Browser's shop buttons on the Items page. Each is a site items list, so the site's Load list opens it. A save or an add keeps the previous file as `.bak`; Delete renames the file to `.bak`. | Shops → Lists. Nothing on the site reads them yet. |
| `home-page.html` | You. | The Use home page override module, which copies it over the site's `index.html`. You can point that module at another file on the Customize Site page. |

A module skips a file that isn't here, so leave out what you don't use.
