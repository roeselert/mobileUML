# mobileUML idea

I need a small tool create specs for ai agents. The key feature is that I can mix text and plantUML diagrams in one file. 

The app is a PWA (only html, css and JavaScript) any additional dependency should be loaded via cdn. 

From a high level view the tool is similar to Juypter, but only supports text, plantUML and JavaScript sections.

If possible add a custom keyboard extension (arrow keys, tab, paste, copy)

Text sections use markdown. The markdown soure is rendered on request below the section.

PlantUML section renders the diagram below the section.  To render the diagram the diagram is encoded and send to the plantUML web proxy

The JavaScript section can execute the code. Logs are printed below.

It is possible to import files from disc and exported to disc. Inbetween the files are stored in the browser storage. 

The app is hosted as pwa on github pages. 



