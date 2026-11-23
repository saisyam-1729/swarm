#!/bin/sh
# PURPOSE: Ensure Mosquitto has a password file before start (no anonymous access).
set -e
PASSWD=/mosquitto/data/passwd
CONF=/mosquitto/config/mosquitto.conf

if [ ! -f "$PASSWD" ] || [ ! -s "$PASSWD" ]; then
  USER="${MQTT_BACKEND_USER:-swarm-backend}"
  PASS="${MQTT_BACKEND_PASSWORD:-changeme-mqtt-backend}"
  echo "Creating Mosquitto password file for user '$USER' (override MQTT_BACKEND_USER/PASSWORD)."
  mosquitto_passwd -b -c "$PASSWD" "$USER" "$PASS"
  chmod 0700 "$PASSWD"
fi

exec /usr/sbin/mosquitto -c "$CONF"
