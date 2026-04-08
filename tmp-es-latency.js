require('dotenv').config();
console.log('start');
const { Client } = require('@elastic/elasticsearch');
console.log('client lib loaded');
const client = new Client({ node: 'http://52.175.247.13:9200', auth: { username: process.env.ELASTICSEARCH_USERNAME, password: process.env.ELASTICSEARCH_PASSWORD } });
(async()=>{ try { const r=await client.count({index:'products_detail_v1'}); console.log('count',r.count); } catch(e){ console.error('err',e); process.exit(1);} })();