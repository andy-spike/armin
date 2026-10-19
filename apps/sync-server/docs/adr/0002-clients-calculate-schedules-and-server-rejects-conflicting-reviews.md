# Clients calculate schedules and the server rejects conflicting reviews

Clients send their calculated Review-unit schedule with each review update.
When two devices submit updates based on the same older version, the server
keeps the first accepted schedule and returns a conflict for the second; that
client preserves its pending review for later resolution. The server does not
replay reviews or recalculate schedules, keeping the first implementation small.
