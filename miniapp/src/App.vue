<script lang="ts">
import { useCommunityStore } from './stores/community';
import { useCartStore } from './stores/cart';
import { useUserStore } from './stores/user';

export default {
  onLaunch() {
    void useCommunityStore().loadCommunities();
    const userStore = useUserStore();
    void userStore.restoreSession().then(() => {
      if (userStore.accessToken) void useCartStore().load(userStore.accessToken);
    });
  },
};
</script>

<style lang="scss">
page {
  min-height: 100%;
  color: #21302a;
  background: #f3f7f5;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

view,
text {
  box-sizing: border-box;
}
</style>
