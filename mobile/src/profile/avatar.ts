import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import RNFS from 'react-native-fs';
import ImagePicker from 'react-native-image-crop-picker';
import { currentDatabase } from '@/database/database';

export async function chooseAndStageAvatar(userId: string) {
  const image = await ImagePicker.openPicker({
    mediaType: 'photo',
    cropping: true,
    width: 512,
    height: 512,
    compressImageQuality: 0.88,
  });
  const directory = `${RNFS.DocumentDirectoryPath}/avatars/${userId}`;
  await RNFS.mkdir(directory);
  const extension = image.mime === 'image/png' ? 'png' : 'jpg';
  const destination = `${directory}/${uuid()}.${extension}`;
  await RNFS.copyFile(image.path, destination);
  const id = uuid();
  await currentDatabase().transaction(async (tx) => {
    await tx.execute(
      `insert into pending_asset_uploads (
        id,entity_type,entity_id,private_path,mime_type,state,created_at
      ) values (?,'profile_avatar',?,?,?,?,?)`,
      [id, userId, destination, image.mime, 'pending', new Date().toISOString()]
    );
    await tx.execute('update profile set avatar_uri=? where id=?', [
      destination,
      userId,
    ]);
  });
  return destination;
}

export async function stageAvatarRemoval(userId: string) {
  const id = uuid();
  await currentDatabase().transaction(async (tx) => {
    await tx.execute(
      `insert into pending_asset_uploads (
        id,entity_type,entity_id,private_path,mime_type,state,created_at
      ) values (?,'profile_avatar_remove',?,'','', 'pending',?)`,
      [id, userId, new Date().toISOString()]
    );
    await tx.execute('update profile set avatar_uri=null where id=?', [userId]);
  });
}
