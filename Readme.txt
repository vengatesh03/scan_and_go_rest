pm2 restart on reboot

Add this line in /etc/rc.local
sleep 20 && pm2 start ott-rest-server && support_server && drm-encoder-server && ott_player &


List of changes

1.Advertisement 
2.Channel content id change (Encrypted channels)
3.Channel id mismatched after Deletion of zcube 