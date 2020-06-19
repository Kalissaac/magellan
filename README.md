# magellan
Get navigation directions straight from Discord

## Setup and Running
1. Fill out the `.env` if running locally, or on the hosting platform of your choice. Most of the keys are pretty self-explanatory, but instructions on how to obtain notable things are listed below.

    a. Get a Discord bot token from https://discord.com/developers/applications

    b. Get a MapKit JS private key from https://developer.apple.com/documentation/mapkitjs/creating_a_maps_identifier_and_a_private_key (at the time of writing, this requires a paid Apple Developer Account)

    c. Get an Imgur client ID from https://api.imgur.com/oauth2/addclient (the settings don't really matter as long as you get a client ID from it)

2. Run `npm install` to download dependencies, this bot requires node 12.0.0 or higher.
3. Run `npm start` and the bot should be online! You can mention it and ask for directions and it will respond to the best of it's ability.

> @Bot How do I get to 9149 S Sepulveda Blvd, Los Angeles, CA 90045 from Los Angeles International Airport?

![](https://media.giphy.com/media/ZFK3V146hkhd8eJSIq/giphy.gif)
