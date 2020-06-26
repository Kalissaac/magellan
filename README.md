# `magellan`
A Discord bot that gives navigation directions. You can use natural language to talk to the bot, and it will (to the best of its ability) retrieve directions for you using [MapKit JS](https://developer.apple.com/maps/web/). Once the bot returns the directions, there is a link that will take you to the Maps app so you can send it to your phone or view it in more detail.

> @Bot How do I get to 9149 S Sepulveda Blvd, Los Angeles, CA 90045 from Los Angeles International Airport?

![Demo](https://media.giphy.com/media/ZFK3V146hkhd8eJSIq/giphy.gif)
![Result](https://i.imgur.com/k9BTNHr.png)

## Technologies Used
- [MapKit JS](https://developer.apple.com/maps/web/)
- [Discord.js](https://discord.js.org)
- [jsdom](https://github.com/jsdom/jsdom) (for web browser emulation so that MapKit JS can be used)
- [Imgur API](https://apidocs.imgur.com) (Discord has an image link limit that will be reached if a route is long enough)

## Setup and Running
1. Fill out the `.env` if running locally, or on the hosting platform of your choice. Most of the keys are pretty self-explanatory, but instructions on how to obtain notable things are listed below.

    a. Get a Discord bot token from https://discord.com/developers/applications

    b. Get a MapKit JS private key from https://developer.apple.com/documentation/mapkitjs/creating_a_maps_identifier_and_a_private_key (at the time of writing, this requires a paid Apple Developer Account)

    c. Get an Imgur client ID from https://api.imgur.com/oauth2/addclient (the settings don't really matter as long as you get a client ID from it)

2. Run `npm install` to download dependencies, this bot requires node 12.0.0 or higher.
3. Run `npm start` and the bot should be online! You can mention it and ask for directions and it will respond to the best of it's ability.


