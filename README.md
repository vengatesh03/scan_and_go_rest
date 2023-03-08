# cloud_ott_rest

#Install and connect postgres with sequelize in local 

#Install postgres

sudo apt install postgresql postgresql-contrib

#start the service
sudo service postgresql start

#create user and db 
sudo -u postgres psql
postgres = # create database mydb;
postgres = # create user myuser with encrypted password 'mypass';
postgres = # grant all privileges on database mydb to myuser;

#Add this npm package in package.json
"pg": "^7.17.1", 
"pg-hstore": "^2.3.3",
"sequelize": "^5.21.3" 

#then run npm install
#postgres deafult port is 5432

#if you want to change the port ,change port in /etc/postgresql/10/main/postgresql.conf

#if the port changed,mention that port in sequelize connect

#To connect postgres with sequelize ,do this changes in model.js
const sequelize = new Sequelize("db_name", "user_name", "password", {
    host: 'localhost',
    port: '5432',
    dialect: 'postgres',
    operatorsAliases: false,
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    }
})
#remove this ' COLLATE NOCASE' on db creation

#remote connection for  postgres with sequelize

#server side configuration 

#open the config file /etc/postgresql/10/main/postgresql.conf 
#add this lines to config file 
listen_addresses = '*' -> start postgres with ip
host all all 192.168.200.1/24 trust ->only this ip will be allowed to get remote connection

#restart the postgres
sudo service postgresql restart

#client side configuration

#If you want to connect this db from your network means first add your ip on remote config file( host all all 192.168.200.1/24 trust)

#change the host in sequelize connect
#postgres deafult port is 5432                                                                                                                                                                                                                                                                                                                 
#if you want to change the port ,change port in /etc/postgresql/10/main/postgresql.conf  

const sequelize = new Sequelize("db_name", "user_name", "password", {
    host: 'remote_ip',
    port: 'remote_port',
    dialect: 'postgres',
    operatorsAliases: false,
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    }
})





DB ALTER COMMANDS


ALTER TABLE operatorsettings add column reference_name	varchar(255);
ALTER TABLE operatorsettings add column allow_operator_content boolean deafult false;


ALTER TABLE languages add column logo_url varchar(255);
ALTER TABLE languages add column selected boolean default false;

ALTER TABLE contents add column is_banner boolean default false;
ALTER TABLE contents add column is_playable boolean default false;
ALTER TABLE contents add column is_home boolean default false;

ALTER TABLE operatorsettings add column allow_essentials boolean default false;
ALTER TABLE operatorsettings add column essential_msg varchar(255);

ALTER TABLE ws_metas add column is_active boolean default true;
ALTER TABLE ws_metas add column is_banner boolean default false;
ALTER TABLE ws_metas add column is_playable boolean default false;
ALTER TABLE ws_metas add column is_home boolean default false;

ALTER TABLE operatorapps add column token varchar (255);
ALTER TABLE operatorapps add column org_name varchar (255);













ADD_ON  BUNDLE CHANGE COMMANDS:

alter table orgs add column short_code varchar(255);
alter table providers add column iptv boolean default false;
alter table providers add column sms_host varchar(255);
alter table providers add column sms_port varchar(255);
alter table providers add column sms_token varchar(255);
alter table packages add column amount float default 0;
alter table bundles add column add_on boolean default false;
alter table bundles add column iptv boolean default false;
alter table operatorsettings add column sms_template_key varchar(255);
alter table operatorsettings add column ncf_bundle_id uuid;
alter table operatorsettings add column ncf float default 0;
alter table operatorsettings add column ncf_flag boolean default false;
alter table operatorsettings add column addonbundle json;
alter table operatorsettings add column moqbundle;
alter table operatorsettings add column short_code varchar(255);
alter table operatorsettings add column language json;
alter table transactions add column paid_amount float default 0;
alter table transactions add column receipt_number float default 0;
alter table subscriptions add column serial_no varchar(255);
alter table subscriptions add column checkIptv boolean default false;
alter table subscriptions add column stb_type varchar(255);
alter table subscriptions add column mac_address varchar(255);
alter table invoiceses add column prorated_day varchar(255);
alter table subscriptions rename column checkiptv to "checkIptv";
alter table operatorsettings add column request_type varchar(255);



alter table operatorsettings add column external_apps boolean default false;
alter table operatorsettings add column technical_data json;

alter table external_apps add column is_tv boolean;
alter table external_apps add column is_mobile boolean;
alter table external_apps add column mobile_link varchar (255);
alter table external_apps add column tv_link varchar (255);

alter table banner_images add column is_banner boolean default true;
alter table banner_images add column is_playable boolean default false;
alter table banner_images add column is_home boolean default false;
alter table banner_images add column org_id uuid;
alter table banner_images add column org_name varchar (255);

alter table emms ALTER COLUMN unique_id TYPE varchar(255) USING unique_id::varchar(255);

alter table bundles add column bundle_type varchar(255);
alter table bundles alter COLUMN bundle_type set default 'bundlepackage';
update bundles set bundle_type = 'bundlepackage';

alter table operatorsettings add column allow_for_subscription boolean default false;

alter table subscriptions drop column serial_no;
alter table subscriptions add column serial_no varchar(255);
alter table subscriptions add constraint serial_no unique (serial_no);

alter table link_accesses add column web_link_field varchar(255);
alter table link_accesses add column web_link_format varchar(255);
alter table link_accesses add column tv_native_link_field varchar(255);
alter table link_accesses add column tv_native_link_format varchar(255);
alter table link_accesses add column mobile_native_link_field varchar(255);
alter table link_accesses add column mobile_native_link_format varchar(255);

alter table tokens add column token_mode varchar(255);

alter table link_accesses add column default_screen integer default 0;
alter table link_accesses add column default_token_mode varchar(255);
alter table tokens add column mode varchar(255) default '12M';

alter table operatorsettings add column discount integer default 0 ;
alter table subscriptions add column stb boolean;
alter table subscriptions add column app boolean;
alter table invoices add column discount varchar(255);

alter table providers add column default_method varchar(255);
alter table invoking_methods add column service_category varchar(255);
alter table invoking_methods rename column method to invoking_method;
alter table invoking_methods add column method varchar(255);

alter table bundles add column bundle_mode varchar(255);
alter table operatorsettings add column enable_bundle_creation boolean default false;
alter table bundles add column bundle_cost integer default 0;
alter table operatorsettings add column payment_fields json;
alter table operatorsettings add column api_get_payment_link varchar(255);
alter table operatorsettings add column api_payment_link_status varchar(255);
alter table bill_settings add column payment_fields json;
alter table bill_settings add column api_get_payment_link varchar(255);
alter table bill_settings add column api_payment_link_status varchar(255);
alter table subscriptions add column renewal_type varchar(255);

alter table transactions add column subscription_payment integer;
alter table transactions add column subscription_payment_id varchar(255);

alter table operatorsettings add column moq_duration varchar(255);
alter table operatorsettings add column moq_cost integer default 0;
alter table operatorsettings add column moq_slab_name varchar(255);
alter table operatorsettings add column moq_slab_list JSON;
alter table transactions add column is_moq boolean default false;
alter table transactions add column carry_forwarded double precision default 0;
alter table operatorsettings add column moq_carry_forward boolean default false;

alter table orgs add column ott boolean default false;
alter table orgs add column iptv boolean default false;
ALTER TABLE invoices MODIFY transaction_id char(36);
ALTER TABLE transactions MODIFY transaction_id char(36);
alter table orgs add column ott boolean default false;
alter table orgs add column iptv boolean default false;

alter table bundles add column is_external_packages boolean default false;
alter table operatorsettings drop column external_app_host;
alter table operatorsettings drop column external_app_plan;
alter table operatorsettings drop column external_app_token;
alter table operatorsettings drop column external_app_code;


alter table external_apps add column monthly_code varchar(255);
alter table external_apps add column quarterly_code varchar(255);
alter table external_apps add column halfyearly_code varchar(255);
alter table external_apps add column yearly_code varchar(255);

alter table syncevents add column stb_created_sync_time timestamp with time zone default NOW();
alter table syncevents add column stb_updated_sync_time timestamp with time zone default NOW();
alter table syncevents add column pack_created_sync_time timestamp with time zone default NOW();
alter table syncevents add column pack_updated_sync_time timestamp with time zone default NOW();
alter table emms add constraint unique_id UNIQUE(unique_id);

ALTER TABLE orgs ADD COLUMN enable_iptv tinyint(1);
ALTER TABLE orgs ADD COLUMN mso_provider varchar(255);
ALTER TABLE orgs ADD COLUMN allowed_app tinyint(1);   
ALTER TABLE orgs ADD COLUMN provider_id char(36);
ALTER TABLE operatorapp ADD COLUMN dynamic_conf longtext;

ALTER TABLE operatorapp ADD COLUMN ott_url varchar(255);      
ALTER TABLE subscriptions add column notification_token varchar(1000);

ALTER TABLE operatorapp ADD COLUMN ott_url varchar(255);          
alter table orgs add constraint org_name unique (org_name);
alter table accesslogins add column org_id char(36);

ALTER TABLE onprems ADD COLUMN provider_name varchar(255);
ALTER TABLE onprems ADD COLUMN provider_id varchar(255);          
alter table subscriptions add column notification_token varchar (255);
ALTER TABLE allowedapps ADD COLUMN version varchar(255) DEFAULT 1;
alter table operatorapps add column current_version varchar (255);
ALTER TABLE contents add column lcn_number integer DEFAULT 1;
alter table bundles add column ncf_price float;
alter table bundles add column ott_price float;
alter table bundles add column recommend_cost float;
alter table bundles add column seller_cost float;
alter table bundles add column reseller_bundle_type varchar(255);
alter table invoices modify column bund_name varchar(10000);
alter table transactions modify column bundle varchar(10000);
alter table bundles add column org_id char(36);
alter table operatorsettings add column enable_reseller_bundle_creation tinyint(1);
alter table emms add column version varchar(255);
alter table transactions add column enable_reseller_bundle_creation tinyint(1);
alter table invoices modify column bund_name varchar(10000);
alter table transactions modify column bundle varchar(10000);
alter table emms add column version varchar(255);
alter table vendor add column prefix varchar(255);
alter table vendor add column starting_serial_no varchar(255);
alter table link_accesses modify column allow_sites varchar(10000);
alter table bundles add column allowed_device varchar(255);
alter table operatorsettings add column whatsapp_number varchar(255);
alter table operatorsettings add column pre_activation json:
alter table operatorsettings add column pre_activation_flag tinyint(1);
alter table operatorsettings add column is_fixed_rate tinyint(1);
alter table subscriptions add column stb_login int(11);
