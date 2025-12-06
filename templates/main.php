<?php
use OCP\Util;
Util::addStyle('domus', 'style');
Util::addScript('domus', 'app');
?>
<div id="app-navigation"></div>
<div id="app-content"></div>
<div id="app-sidebar"></div>
<script>
    window.Domus = window.Domus || {};
    window.Domus.accounts = <?php echo json_encode($accounts ?? [], JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT); ?>;
</script>
