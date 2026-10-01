// Extra deterministic SQL invariants for the disposable QA database only.
import assert from "node:assert/strict";
export async function verifyWave2Sql(database) {
  await database.exec(`INSERT INTO garageos."Shop" (id,name) VALUES ('w2-sql-shop','Disposable SQL');
    INSERT INTO garageos."User" (id,name,email,role) VALUES ('w2-sql-sales','SQL Sales','sql-sales@example.test','SUPER_ADMIN');
    INSERT INTO garageos."SalesDemo" (id,"shopId","createdByUserId","expiresAt","updatedAt",status) VALUES ('w2-sql-demo','w2-sql-shop','w2-sql-sales',now()+interval '1 day',now(),'ACTIVE');`);
  const send = (id, segments = 7) => database.query(`INSERT INTO garageos."CommunicationMessage" (id,"shopId",channel,direction,provider,"providerMessageId","from","to",cc,bcc,"references",segments,"billedOverageSegments")
    VALUES ($1,'w2-sql-shop','SMS','OUTBOUND','twilio','SMfake','sender',ARRAY['recipient'],ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],$2,$2)`, [id, segments]);
  await send("w2-demo-message");
  let m = (await database.query(`SELECT * FROM garageos."CommunicationMessage" WHERE id='w2-demo-message'`)).rows[0];
  assert.equal(m.salesDemoOriginId, "w2-sql-demo"); assert.equal(m.billedOverageSegments, 0);
  await database.exec(`UPDATE garageos."SalesDemo" SET status='CONVERTED',"convertedAt"=now() WHERE id='w2-sql-demo';
    UPDATE garageos."CommunicationMessage" SET "salesDemoOriginId"=NULL,"billedOverageSegments"=999,status='DELIVERED' WHERE id='w2-demo-message';`);
  m = (await database.query(`SELECT * FROM garageos."CommunicationMessage" WHERE id='w2-demo-message'`)).rows[0];
  assert.equal(m.salesDemoOriginId, "w2-sql-demo"); assert.equal(m.billedOverageSegments, 0);
  await database.exec(`DELETE FROM garageos."SalesDemo" WHERE id='w2-sql-demo';
    UPDATE garageos."CommunicationMessage" SET "salesDemoOriginId"='replacement',"billedOverageSegments"=333,status='FAILED' WHERE id='w2-demo-message';`);
  m = (await database.query(`SELECT * FROM garageos."CommunicationMessage" WHERE id='w2-demo-message'`)).rows[0];
  assert.equal(m.salesDemoOriginId, "w2-sql-demo"); assert.equal(m.billedOverageSegments, 0);
  await send("w2-paid-message", 3);
  m = (await database.query(`SELECT * FROM garageos."CommunicationMessage" WHERE id='w2-paid-message'`)).rows[0];
  assert.equal(m.salesDemoOriginId, null); assert.equal(m.billedOverageSegments, 3);
  await database.exec(`DELETE FROM garageos."Shop" WHERE id='w2-sql-shop'; DELETE FROM garageos."User" WHERE id='w2-sql-sales';`);
  console.log("[wave2-sql] PASS demo origin/zero overage immutable after conversion/deletion; normal paid segments unchanged.");
}
export async function wave2Control(database, req, res) {
  if (req.url === "/wave2-state") {
    const demos = (await database.query(`SELECT d.*,s.slug,s."onboardingCompletedAt",s."communicationsSuspendedAt",s."logoUrl",s."bookingCoverImageUrl",s."bookingShopImageUrl",s."bookingTemplate",s."bookingTypography" FROM garageos."SalesDemo" d JOIN garageos."Shop" s ON s.id=d."shopId"`)).rows;
    const counts = {};
    for (const model of ["Client", "Vehicle", "Appointment", "Quote", "WorkOrder", "Invoice"]) counts[model] = (await database.query(`SELECT count(*)::int AS count FROM garageos."${model}" WHERE "demoSeedBatchId" IS NOT NULL`)).rows[0].count;
    res.end(JSON.stringify({ demos, counts })); return true;
  }
  if (req.method !== "POST") return false;
  if (req.url === "/wave2-booking") {
    await database.exec(`UPDATE garageos."Shop" SET "bookingEnabled"=true,"bookingTemplate"='MODERN',"bookingTypography"='PREMIUM' WHERE id IN (SELECT "shopId" FROM garageos."SalesDemo");`);
  } else if (req.url === "/wave2-live") {
    await database.exec(`INSERT INTO garageos."Client" (id,"shopId","firstName","updatedAt") SELECT 'w2-live-client',"shopId",'Real prospect',now() FROM garageos."SalesDemo" LIMIT 1;
      INSERT INTO garageos."Appointment" (id,"shopId","clientId",title,"startsAt","endsAt","durationMinutes","updatedAt") SELECT 'w2-live-appt',"shopId",'w2-live-client','Live entered data',now()+interval '2 days',now()+interval '2 days 1 hour',60,now() FROM garageos."SalesDemo" LIMIT 1;`);
  } else if (req.url === "/wave2-link") {
    await database.exec(`INSERT INTO garageos."Vehicle" (id,"clientId",make,model,year,"licensePlate")
      SELECT 'w2-live-vehicle',id,'Live','Vehicle',2024,'LIVE' FROM garageos."Client" WHERE "demoSeedBatchId" IS NOT NULL LIMIT 1;`);
  } else if (req.url === "/wave2-unlink") {
    await database.exec(`DELETE FROM garageos."Vehicle" WHERE id='w2-live-vehicle';`);
  } else if (req.url === "/wave2-complete") {
    await database.exec(`UPDATE garageos."Shop" SET "onboardingCompletedAt"=now() WHERE id IN (SELECT "shopId" FROM garageos."SalesDemo");
      UPDATE garageos."SalesDemo" SET "preferredLanguage"='FR';
      UPDATE garageos."User" SET "preferredLocale"='FR' WHERE id='qa-sales';`);
  } else if (req.url === "/wave2-english") {
    await database.exec(`UPDATE garageos."SalesDemo" SET "preferredLanguage"='EN'; UPDATE garageos."User" SET "preferredLocale"='EN' WHERE id='qa-sales';`);
  } else return false;
  res.end(JSON.stringify({ ok: true })); return true;
}
