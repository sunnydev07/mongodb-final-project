rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "127.0.0.1:28017", priority: 2 },
    { _id: 1, host: "127.0.0.1:28018", priority: 1 },
    { _id: 2, host: "127.0.0.1:28019", priority: 1, arbiterOnly: false }
  ]
});

print("Initiated rs0. Wait a few seconds, then check rs.status().");
print("Connection string example:");
print("mongodb://127.0.0.1:28017,127.0.0.1:28018,127.0.0.1:28019/?replicaSet=rs0");
