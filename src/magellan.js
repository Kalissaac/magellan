//
//  /$$      /$$                               /$$ /$$
//  | $$$    /$$$                              | $$| $$
//  | $$$$  /$$$$  /$$$$$$   /$$$$$$   /$$$$$$ | $$| $$  /$$$$$$  /$$$$$$$
//  | $$ $$/$$ $$ |____  $$ /$$__  $$ /$$__  $$| $$| $$ |____  $$| $$__  $$
//  | $$  $$$| $$  /$$$$$$$| $$  \ $$| $$$$$$$$| $$| $$  /$$$$$$$| $$  \ $$
//  | $$\  $ | $$ /$$__  $$| $$  | $$| $$_____/| $$| $$ /$$__  $$| $$  | $$
//  | $$ \/  | $$|  $$$$$$$|  $$$$$$$|  $$$$$$$| $$| $$|  $$$$$$$| $$  | $$
//  |__/     |__/ \_______/ \____  $$ \_______/|__/|__/ \_______/|__/  |__/
//                          /$$  \ $$
//                         |  $$$$$$/
//                          \______/
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
'use strict'

//
// ///////////////////////////////////////////////////////////////////// //
// External modules

require('dotenv').config()
const {
  DISCORD_TOKEN,
  MAPKIT_KEYID,
  MAPKIT_TEAMID,
  IMGUR_EMAIL,
  IMGUR_PASSWORD,
  IMGUR_CLIENTID,
  DOMAIN
} = process.env
const fs = require('fs')
const MAPKIT_PRIVATEKEY = fs.readFileSync(`./AuthKey_${MAPKIT_KEYID}.p8`)

const jwt = require('jsonwebtoken')
const { sign } = require('jwa')('ES256')

const jsdom = require('jsdom')
const { JSDOM } = jsdom

const Discord = require('discord.js')
const client = new Discord.Client()

const nlp = require('compromise')

const fetch = require('node-fetch')
const imgur = require('imgur')
imgur.setCredentials(IMGUR_EMAIL, IMGUR_PASSWORD, IMGUR_CLIENTID)

//
// ///////////////////////////////////////////////////////////////////// //
// MapKit Route Generation

/**
 * Generates a token for use with MapKit JS
 * @param {string} authKey MapKit Private Key
 * @param {string} keyId MapKit Key ID
 * @param {string} teamId Apple Developer Team ID
 * @param {number} ttl Time (in seconds) until token expiration. Defaults to 2 hours.
 */
const generateToken = (authKey, keyId, teamId, ttl = 120 * 60) => {
  const payload = {
    iss: teamId,
    iat: Date.now() / 1000,
    exp: (Date.now() / 1000) + ttl
  }

  const header = {
    kid: keyId,
    typ: 'JWT',
    alg: 'ES256',
    origin: `https://${DOMAIN}/`
  }

  return jwt.sign(payload, authKey, { header })
}

/**
 * Generates and returns a MapKit route
 * @param {string} origin Where the directions should start
 * @param {string} destination Where the directions should end
 * @returns {Promise<mapkit.Route>} A MapKit Route object
 */
const generateRoute = async (origin, destination) => {
  return new Promise((resolve, reject) => {
    /* eslint-disable no-new */
    new JSDOM(`
    <!DOCTYPE html>
    <html>
    <head>
    <meta charset="utf-8">

    <script src="https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js"></script>

    <style>
    #map {
        width: 100%;
        height: 900px;
    }
    </style>

    </head>

    <body>
    <div id="map"></div>
    </body>

    <script>
    mapkit.init({
        authorizationCallback: function(done) {
            done("${generateToken(MAPKIT_PRIVATEKEY, MAPKIT_KEYID, MAPKIT_TEAMID)}")
        }
    })

    const directions = new mapkit.Directions()
    directions.route({
      origin: "${origin}",
      destination: "${destination}",
      transportType: mapkit.Directions.Transport.Automobile,
      requestsAlternateRoutes: false
    }, (error, data) => {
      if (error) window.onRouteFailed(error)
      else if (data.routes.length === 0) window.onRouteFailed("No directions found for the specified route! Try including more details such as city, state and zip code.")
      else window.onRouteFinalized(data.routes[0])
    })
    </script>`, {
      url: `https://${DOMAIN}/`,
      referrer: `https://${DOMAIN}/`,
      resources: 'usable',
      runScripts: 'dangerously',
      beforeParse (window) {
        window.matchMedia = () => ({
          addListener: () => ({})
        })
        window.HTMLCanvasElement = () => ({
          getContext: () => ({})
        })
        window.onRouteFinalized = (route) => {
          console.log('Route information recieved')
          resolve(route)
        }
        window.onRouteFailed = (error) => {
          console.error(error)
          reject(error)
        }
      }
    })
  })
}

//
// ///////////////////////////////////////////////////////////////////// //
// MapKit Snapshot Generation

/**
 * Converts a number to radians
 * @param {number} number Number to convert
 */
const numberToRadians = number => {
  return number * Math.PI / 180
}

/**
 * Converts a number to degrees
 * @param {number} number Number to convert
 */
const numberToDegrees = number => {
  return number * (180 / Math.PI)
}

/**
 * Calculates the absolute center between the origin and destination
 * points of a MapKit polyline.
 * @param {mapkit.PolylineOverlay} polyline A MapKit polyline overlay
 * @returns {string} Latitude-longitude coordinate pair
 */
const calculateMapCenterForRoute = (polyline) => {
  const origin = polyline[0].split(',').map(x => parseFloat(x))
  const destination = polyline[polyline.length - 1].split(',').map(x => parseFloat(x))

  // Longitude difference
  const dLng = numberToRadians(destination[1] - origin[1])

  // Convert to radians
  const lat1 = numberToRadians(origin[0])
  const lat2 = numberToRadians(destination[0])
  const lng1 = numberToRadians(origin[1])

  var bX = Math.cos(lat2) * Math.cos(dLng)
  var bY = Math.cos(lat2) * Math.sin(dLng)
  var lat3 = Math.atan2(Math.sin(lat1) + Math.sin(lat2), Math.sqrt((Math.cos(lat1) + bX) * (Math.cos(lat1) + bX) + bY * bY))
  var lng3 = lng1 + Math.atan2(bY, Math.cos(lat1) + bX)

  // Return result
  const centerPoint = [numberToDegrees(lng3), numberToDegrees(lat3)]

  return centerPoint.reverse().join(',')
}

/**
 * Calculates the radius of map to show around center point.
 * Uses the route to ensure that entire route length is
 * included in the map.
 * @param {string} center Center coordinate
 * @param {mapkit.Route} route Route to calculate span for
 */
const calculateMapSpanForRoute = (center, route) => {
  let span = [0, 0]
  center = center.split(',')
  const polyline = route.polyline.points
  let farthestLatitude
  let farthestLongitude
  const origin = polyline[0]
  const destination = polyline[polyline.length - 1]

  farthestLatitude = Math.abs(center[0] - origin.latitude)
  farthestLongitude = Math.abs(center[1] - origin.longitude)

  if (Math.abs(center[0] - destination.latitude) > farthestLatitude) farthestLatitude = Math.abs(center[0] - destination.latitude)
  if (Math.abs(center[1] - destination.longitude) > farthestLongitude) farthestLongitude = Math.abs(center[1] - destination.longitude)

  for (const point of polyline) {
    if (Math.abs(center[0] - point.latitude) > farthestLatitude) farthestLatitude = Math.abs(center[0] - point.latitude)
    if (Math.abs(center[1] - point.longitude) > farthestLongitude) farthestLongitude = Math.abs(center[1] - point.longitude)
  }

  // Add 10% of margin around the edges
  farthestLatitude *= 2.5
  farthestLongitude *= 2.5

  span = [farthestLatitude, farthestLongitude]

  return span.join(',')
}

/**
 * MapKit JS compatible URL encoding
 * @param {Object} unencodedObject Unencoded Object containing URL parameters
 * @returns {string} Encoded URL parameters
 */
const appleCompatibleUrlEncodingPleaseSendHelp = (unencodedObject) => {
  let encodedString = ''

  for (const key in unencodedObject) {
    let value = unencodedObject[key]
    if (value instanceof Object || value instanceof Array) {
      value = JSON.stringify(value)
      value = encodeURIComponent(value)
      encodedString += `&${key}=${value}`
    } else {
      value = encodeURIComponent(value)
      encodedString += `&${key}=${value}`
    }
  }

  encodedString = encodedString.substr(1) // Remove first "&" character from string

  return encodedString
}

/**
 * Generates a signed request URL for a MapKit snapshot.
 * @param {string} params Snapshot parameters
 */
const signRequest = params => {
  const snapshotPath = `/api/v1/snapshot?${params}`
  const completePath = `${snapshotPath}&teamId=${MAPKIT_TEAMID}&keyId=${MAPKIT_KEYID}`
  const signature = sign(completePath, MAPKIT_PRIVATEKEY)

  // Append the signature to the end of the request URL, and return.
  return `${completePath}&signature=${signature}`
}

//
// ///////////////////////////////////////////////////////////////////// //
// Discord

/**
 * Displays a MapKit JS route in a Discord Embed.
 * @param {mapkit.Route} route Route to display in embed
 * @param {Discord.MessageEmbed} embed Embed to display route in
 */
const showRouteInEmbed = async (route, embed) => {
  embed.setTitle(route.name + ' to ' + embed.fields[1].value)
  embed.setDescription('')
  embed.addField('Distance', Math.round((route.distance * 0.0006213712 + Number.EPSILON) * 100) / 100 + ' mi', true)
  embed.addField('Travel Time', Math.round(route.expectedTravelTime / 60) + ' min', true)
  let travelSteps = ''
  for (let i = 0; i < route.steps.length; i++) {
    const step = route.steps[i]
    if (!step.distance) continue
    if (travelSteps.length >= 940) { travelSteps += '\n...'; break }
    travelSteps += `\n**${step.pathIndex}. ${Math.round((step.distance * 0.0006213712 + Number.EPSILON) * 100) / 100 + ' mi'}:** ${step.instructions}`
  }
  embed.addField('Directions', travelSteps)

  const polyline = route.polyline.points.map((coordinate) => {
    if (!coordinate.latitude || !coordinate.longitude) return
    return `${coordinate.latitude},${coordinate.longitude}` // Convert MapKit coordinate to polyline coordinate (string-based)
  }).filter((_, index) => {
    return index % 4 === 0 // Only keep 1/4th of the points to fit within URL lengths
  })
  const mapCenter = calculateMapCenterForRoute(polyline)

  const parameters = appleCompatibleUrlEncodingPleaseSendHelp({
    center: mapCenter,
    colorScheme: 'light',
    z: 13,
    spn: calculateMapSpanForRoute(mapCenter, route),
    overlays: [{ points: [...new Set(polyline)], lineWidth: 2 }],
    annotations: [{ point: polyline[0], color: '449944', glyphText: 'A' }, { point: polyline[polyline.length - 1], color: '449944', glyphText: 'B' }]
  })

  const requestURL = `https://snapshot.apple-mapkit.com${signRequest(parameters)}`
  const imageResponse = await fetch(requestURL, { method: 'GET' })
  if (imageResponse.ok) {
    const imageLink = await imgur.uploadUrl(requestURL, process.env.IMGUR_ALBUMID).catch(console.error)
    console.log(imageLink.data.link)
    embed.setImage(imageLink.data.link)
    embed.setDescription(`[Open in Maps](http://maps.apple.com/?saddr=${encodeURIComponent(embed.fields[0].value)}&daddr=${encodeURIComponent(embed.fields[1].value)}&dirflg=d) or [View Full Image](${imageLink.data.link})`)
  } else {
    console.error(imageResponse.statusText)
    console.error(imageResponse)
  }

  embed.setFooter('Powered by MapKit JS')
  embed.setTimestamp(new Date())
  return embed
}

client.on('ready', () => {
  console.log('Discord bot online')
})

client.on('message', async message => {
  if (message.author.bot === true || !message.content.startsWith(`<@!${client.user.id}>`)) return
  message.channel.startTyping()

  let origin
  let destination

  const destinationFirst = nlp(message.content).match('to [<destination>*] from [<origin>*]').groups()
  const originFirst = nlp(message.content).match('from [<origin>*] to [<destination>*]').groups()

  /* eslint-disable padded-blocks */
  if (destinationFirst.destination && destinationFirst.origin) {
    destination = destinationFirst.destination.toTitleCase().text().trim()
    origin = destinationFirst.origin.toTitleCase().text().trim()

  } else if (originFirst.origin && originFirst.destination) {
    origin = originFirst.origin.toTitleCase().text().trim()
    destination = originFirst.destination.toTitleCase().text().trim()

  } else return
  /* eslint-enable padded-blocks */

  // Remove any question marks from string
  origin.replace('?', '')
  destination.replace('?', '')

  let embed = new Discord.MessageEmbed()
  embed.setTitle('Directions')
  embed.setDescription('Fetching directions from server (may take up to 30 sec.)')
  embed.addField('Origin', origin)
  embed.addField('Destination', destination)
  const reply = await message.reply(embed)

  generateRoute(origin, destination)
    .then(async route => {
      embed = await showRouteInEmbed(route, embed)
      reply.edit(embed).catch(console.error)
      message.channel.stopTyping()
    }).catch(error => {
      error = error.toString().replace(/http\S+/, '[redacted]') // Remove any URLs in error message as they can surpass the Discord length limit
      console.error(error)
      embed.setDescription('Error occured! ' + error)
      embed.setColor('RED')
      reply.edit(embed).catch(console.error)
      message.channel.stopTyping()
    })
})

client.login(DISCORD_TOKEN)

//
// ///////////////////////////////////////////////////////////////////// //
// General error handling

client.on('error', console.error)
client.on('rateLimit', console.error)
client.on('shardError', console.error)
client.on('warn', console.error)

process.on('uncaughtException', console.error)
process.on('unhandledRejection', console.error)
process.on('warning', console.error)
