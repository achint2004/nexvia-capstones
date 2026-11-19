require('dotenv').config();
const http = require('http');
const WebSocket = require('ws');
const Y = require('yjs');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');
const encoding = require('lib0/encoding');
const decoding = require('lib0/decoding');
const Redis = require('ioredis');

const PORT = process.env.PORT || 1234;
const INSTANCE_ID = Math.random().toString(36).slice(2, 9);

const pub = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;
const sub = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;

const docs = new Map();
const messageSync = 0;
const messageAwareness = 1;

function getYDoc(docName) {
  let entry = docs.get(docName);
  if (!entry) {
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    const conns = new Set();

    doc.on('update', (update, origin) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);

      conns.forEach((conn) => {
        if (conn !== origin && conn.readyState === WebSocket.OPEN) {
          conn.send(message);
        }
      });

      if (pub && origin !== 'redis') {
        pub.publish(
          `yjs-doc:${docName}`,
          JSON.stringify({
            instanceId: INSTANCE_ID,
            update: Buffer.from(update).toString('base64'),
          })
        );
      }
    });

    awareness.on('update', ({ added, updated, removed }, origin) => {
      const changedClients = added.concat(updated, removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
      );
      const message = encoding.toUint8Array(encoder);
      conns.forEach((conn) => {
        if (conn !== origin && conn.readyState === WebSocket.OPEN) {
          conn.send(message);
        }
      });
    });

    entry = { doc, awareness, conns };
    docs.set(docName, entry);
  }
  return entry;
}

if (sub) {
  sub.psubscribe('yjs-doc:*', (err) => {
    if (err) console.error('Redis psubscribe error:', err);
  });

  sub.on('pmessage', (_pattern, channel, raw) => {
    try {
      const { instanceId, update } = JSON.parse(raw);
      if (instanceId === INSTANCE_ID) return;
      const docName = channel.replace('yjs-doc:', '');
      const { doc } = getYDoc(docName);
      Y.applyUpdate(doc, Buffer.from(update, 'base64'), 'redis');
    } catch (e) {
      console.error('Redis sync parse error:', e);
    }
  });
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', instanceId: INSTANCE_ID, activeDocs: docs.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (conn, req) => {
  const docName = decodeURIComponent((req.url || '/default').slice(1).split('?')[0]) || 'default';
  const { doc, awareness, conns } = getYDoc(docName);
  conns.add(conn);

  // Send initial sync step 1
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, doc);
  conn.send(encoding.toUint8Array(encoder));

  // Send current awareness states
  const awarenessStates = awareness.getStates();
  if (awarenessStates.size > 0) {
    const awEncoder = encoding.createEncoder();
    encoding.writeVarUint(awEncoder, messageAwareness);
    encoding.writeVarUint8Array(
      awEncoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awarenessStates.keys()))
    );
    conn.send(encoding.toUint8Array(awEncoder));
  }

  conn.on('message', (data) => {
    try {
      const message = new Uint8Array(data);
      const decoder = decoding.createDecoder(message);
      const messageType = decoding.readVarUint(decoder);

      if (messageType === messageSync) {
        const respEncoder = encoding.createEncoder();
        encoding.writeVarUint(respEncoder, messageSync);
        syncProtocol.readSyncMessage(decoder, respEncoder, doc, conn);
        if (encoding.length(respEncoder) > 1) {
          conn.send(encoding.toUint8Array(respEncoder));
        }
      } else if (messageType === messageAwareness) {
        awarenessProtocol.applyAwarenessUpdate(
          awareness,
          decoding.readVarUint8Array(decoder),
          conn
        );
      }
    } catch (err) {
      console.error('WS message error:', err);
    }
  });

  conn.on('close', () => {
    conns.delete(conn);
  });
});

server.listen(PORT, () => {
  console.log(`y-websocket Redis server [${INSTANCE_ID}] listening on port ${PORT}`);
});
